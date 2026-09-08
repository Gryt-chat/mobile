import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { createClientNonce, evaluateServerProof } from "../identity/serverProof";
import { getRememberedScheme, getServerWsBase, type Scheme } from "../servers/address";
import { fetchServerInfo } from "../servers/info";
import { readInviteCode } from "../servers/inviteCodes";
import { identityFrom, type SessionIdentity } from "./claims";
import { publishDmKey } from "./publishDmKey";
import { msUntilRefresh, shouldRefresh } from "./expiry";
import { guardSocket } from "./guard";
import { getAccountCertificate } from "../account/store";
import { JoinError, joinServer, type AccountCertificate } from "./join";
import { getPin, savePin } from "./pins";
import { identityScopeFor } from "../identity/scope";
import { rememberAccountServer } from "../account/accountServers";
import { rememberGuestScope } from "../identity/guestHistory";
import { mayClaim } from "../identity/identityClaims";
import { clearTokens, readTokens, writeTokens } from "./tokens";
import type { ConnectionState, ServerDetails } from "./types";

/**
 * What a socket refused by a server that is demonstrably up most often means.
 * React Native sends `Origin:`, and a server older than GRYT-413 refuses it.
 */
const ORIGIN_HINT =
  "The server closed the connection. If it is older than 1.4.7 it may be refusing this app's origin.";

/** How long to give the server to answer `server:identify`. */
const IDENTITY_TIMEOUT_MS = 5000;

/**
 * How long to wait for a token asked for on demand. Short, because a send is held
 * up behind it, and **the token already held is used when it runs out**.
 */
const REFRESH_TIMEOUT_MS = 4000;

/**
 * How hard to try to get back: forever, with a ceiling on the gap. A phone loses
 * its socket constantly. The randomisation spreads a server coming back up.
 */

/**
 * How long to let a session restore finish before asking for the channel list.
 * Generous: it is only ever waited out when the restore produced nothing.
 */
const RESTORE_GRACE_MS = 2500;

const RECONNECT = {
  reconnection: true,
  reconnectionDelay: 800,
  reconnectionDelayMax: 8000,
  randomizationFactor: 0.5,
} as const;

/**
 * Connect to one server, prove it is the right one, join, and read its channels.
 * **The order is not negotiable** — the guard holds everything after identify.
 */
export interface Connection {
  state: ConnectionState;
  /**
   * The live socket, or null before one exists. **Deliberately the same socket
   * rather than a second one** — a join is per connection.
   */
  socket: Socket | null;
  /**
   * Who this device is on this server, read from the access token's claims. Null
   * until a session exists; an optimistic message needs the same sender id.
   */
  me: SessionIdentity | null;
  /**
   * The access token to put in a payload, refreshed if due. **The refresh timer
   * is a `setTimeout` and a backgrounded phone does not run those.**
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * Connected *and* past the proof — safe to send on. Separate from `state`
   * because a reconnect must not blank the screen.
   */
  online: boolean;
  /**
   * Throw the session away and join again from scratch, for the one case that
   * needs it: letting an account take over the guest membership (GRYT-502).
   */
  rejoin: () => Promise<void>;
}

export function useConnection(
  host: string | null,
  nickname: string,
  /**
   * How to dial this host, from `useServerScheme`. Null while that is being
   * worked out: a WebSocket has no redirect to follow, so a guess is dead.
   */
  address: { scheme: Scheme | null; confirmed: boolean },
  /**
   * The account's access token, if signed in. A function rather than a value, so
   * the join asks at the moment it needs one and a stale one gets refreshed.
   */
  getAccountToken?: () => Promise<string | null>,
): Connection {
  const [state, setState] = useState<ConnectionState>({ status: "idle" });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [me, setMe] = useState<SessionIdentity | null>(null);
  const [online, setOnline] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  /* The implementation lives inside the effect, where the socket is. The ref
   * keeps the handed-out function stable across renders. */
  const accessTokenRef = useRef<() => Promise<string | null>>(async () => null);
  const getAccessToken = useCallback(() => accessTokenRef.current(), []);

  /* Same shape as `accessTokenRef`: the implementation is inside the effect, and
   * the ref keeps the handed-out function stable. */
  const rejoinRef = useRef<() => Promise<void>>(async () => {});
  const rejoin = useCallback(() => rejoinRef.current(), []);

  /**
   * The nickname is read at join time and nowhere else, so **it is a ref rather
   * than a dependency** — as one, the stored default reconnected on every launch.
   */
  const nicknameRef = useRef(nickname);
  nicknameRef.current = nickname;

  const { scheme, confirmed } = address;

  useEffect(() => {
    if (!host) {
      setState({ status: "idle" });
      setMe(null);
      setOnline(false);
      return;
    }

    if (!scheme) {
      /* Waiting on `/info` to say whether this server is http or https. A
       * connecting state, because the alternative is a blank screen. */
      setState({ status: "connecting" });
      setOnline(false);
      return;
    }

    let cancelled = false;
    const set = (next: ConnectionState) => {
      if (!cancelled) setState(next);
    };

    /** Whoever the token says we are, whenever a new one arrives. */
    const adopt = (accessToken: string) => {
      if (!cancelled) setMe(identityFrom(accessToken));
    };

    set({ status: "connecting" });

    const socket = io(getServerWsBase(host, scheme), {
      // Only websocket. React Native handles socket.io's polling transport
      // badly, and the desktop client does not use it either.
      transports: ["websocket"],
      timeout: 10_000,
      ...RECONNECT,
    });
    socketRef.current = socket;
    setSocket(socket);

    const guard = guardSocket(socket);

    /* Per connection, not per hook. Each of these is reset by `beginHandshake`
     * so a reconnect is proved on its own terms rather than on the last one's. */
    let identitySettled = false;
    let identityTimer: ReturnType<typeof setTimeout> | null = null;
    let nonce = createClientNonce(Crypto.getRandomBytes(32));
    /** False until the first connection has been proved and the session restored. */
    let established = false;
    /** Whether this connection has already said what key to encrypt to us. */
    let dmKeyPublished = false;
    /* One `/info` per mount, on the failure path only. See `connect_error`. */
    let probed = false;

    const settleIdentity = async (proof?: string) => {
      if (identitySettled || cancelled) return;
      identitySettled = true;
      if (identityTimer) clearTimeout(identityTimer);
      identityTimer = null;

      const pinned = await getPin(host);
      const decision = evaluateServerProof({ proof, sentNonce: nonce, pinned });

      if (decision.action === "block") {
        guard.refuse();
        if (!cancelled) setOnline(false);
        set({
          status: "refused",
          reason: decision.failure.reason,
          detail: decision.failure.detail,
        });
        return;
      }

      if (decision.action === "pin") {
        await savePin(host, {
          keyId: decision.keyId,
          jwk: decision.jwk,
          host,
          pinnedAt: Date.now(),
        });
      }

      guard.release();
      if (!cancelled) setOnline(true);

      /* A reconnect keeps whatever is on screen. Dropping to a spinner because
       * the wifi blinked would throw away a channel the reader is in. */
      if (!established) set({ status: "joining" });

      const stored = await readTokens(host);

      if (stored) {
        /**
         * Already a member here — present the token rather than joining again. A
         * stale one is fine: the `server:details` that follows says so.
         */
        adopt(stored.accessToken);
        if (shouldRefresh(stored.accessToken) && stored.refreshToken) {
          socket.emit("token:refresh", { refreshToken: stored.refreshToken });
        }
        socket.emit("session:restore", { accessToken: stored.accessToken });

        /**
         * **Do not ask for the channel list here.** The server sends it once the
         * restore finishes; asking sooner is answered `join_required`.
         */
        if (detailsTimer) clearTimeout(detailsTimer);
        detailsTimer = setTimeout(() => socket.emit("server:details"), RESTORE_GRACE_MS);

        established = true;
        return;
      }

      await join();
    };

    /** The expensive path: only for a server this device has never joined. */
    const join = async () => {
      try {
        /* Fetched before the join rather than inside it, so a failure here is
         * about the identity service and reads that way. */
        let accountCertificate: AccountCertificate | undefined;
        try {
          const token = (await getAccountToken?.()) ?? null;
          accountCertificate = (await getAccountCertificate(host, token)) ?? undefined;
        } catch (err) {
          console.warn("[Account] Could not get an identity certificate:", err);
        }

        /* Read here rather than inside the join, for the same reason the
         * certificate is: a join that reads things of its own fails opaquely. */
        const scope = identityScopeFor(host);
        const claimPriorMembership = accountCertificate ? await mayClaim(scope) : false;

        /* The code arrived in the link that opened the sheet, which is why it
         * is in storage. **Only this path spends it** (GRYT-845). */
        const inviteCode = await readInviteCode(host);

        const joined = await joinServer(socket, host, {
          nickname: nicknameRef.current,
          accountCertificate,
          claimPriorMembership,
          inviteCode,
          /* A guest join is what makes this device able to claim something here
           * later, recorded locally because asking the server tells it. */
          onIdentityUsed: (tier) => {
            if (tier === "local") void rememberGuestScope(scope);
            /* A membership made with the account belongs to the account, and
             * this is the only moment anything knows which kind it was. */
            else void rememberAccountServer(host);
          },
        });
        if (cancelled) return;

        await writeTokens(host, {
          accessToken: joined.accessToken,
          refreshToken: joined.refreshToken,
          fileToken: joined.fileToken,
        });
        adopt(joined.accessToken);
        scheduleRefresh(joined.accessToken, joined.refreshToken);

        // The channel list comes back on this, and only to a socket that has
        // joined — an unjoined one gets `{error: "join_required"}`.
        socket.emit("server:details");
        established = true;
      } catch (err) {
        const code = err instanceof JoinError ? err.code : "unknown";
        set({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        // A refused join is final for this attempt. Holding the socket open
        // would leave it looking connected while it can see nothing.
        if (code !== "timeout") socket.disconnect();
      }
    };

    /**
     * Ask for a new access token shortly before this one stops working. A timer,
     * because nothing here polls and there is no natural moment to notice.
     */
    const scheduleRefresh = (accessToken: string, refreshToken?: string) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (!refreshToken) return;

      const delay = msUntilRefresh(accessToken);
      refreshTimer = setTimeout(
        () => socket.emit("token:refresh", { refreshToken }),
        delay ?? 0,
      );
    };

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let detailsTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * A refresh somebody is waiting on, rather than one on a timer. Everyone who
     * asks while one is in flight gets the same answer.
     */
    let refreshWaiters: ((token: string | null) => void)[] = [];
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const settleRefresh = (token: string | null) => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = null;
      const waiting = refreshWaiters;
      refreshWaiters = [];
      for (const resolve of waiting) resolve(token);
    };

    const refreshNow = (refreshToken: string) =>
      new Promise<string | null>((resolve) => {
        refreshWaiters.push(resolve);
        if (refreshWaiters.length > 1) return;
        refreshTimeout = setTimeout(() => settleRefresh(null), REFRESH_TIMEOUT_MS);
        socket.emit("token:refresh", { refreshToken });
      });

    rejoinRef.current = async () => {
      await clearTokens(host);
      /* `connect` after `disconnect` rather than `socket.connect()` alone: an
       * already-open socket ignores it. */
      socket.disconnect();
      socket.connect();
    };

    accessTokenRef.current = async () => {
      const stored = await readTokens(host);
      if (!stored) return null;
      if (!shouldRefresh(stored.accessToken) || !stored.refreshToken) {
        return stored.accessToken;
      }
      return (await refreshNow(stored.refreshToken)) ?? stored.accessToken;
    };

    /**
     * Prove this connection, whichever number it is. **The nonce is regenerated
     * every time**, or anything that recorded the first answer satisfies the next.
     */
    const beginHandshake = () => {
      identitySettled = false;
      nonce = createClientNonce(Crypto.getRandomBytes(32));
      socket.emit("server:identify", { clientNonce: nonce });
      // An older server has no handler and never answers. Silence is "offered no
      // proof": fine for an address never pinned, a refusal for one that was.
      if (identityTimer) clearTimeout(identityTimer);
      identityTimer = setTimeout(() => void settleIdentity(undefined), IDENTITY_TIMEOUT_MS);
    };

    socket.on("connect", beginHandshake);

    /**
     * **Start queueing the moment the socket goes, not when it comes back.**
     * socket.io flushes its buffer on reconnect, before the new server is checked.
     */
    socket.on("disconnect", () => {
      guard.hold();
      if (identityTimer) clearTimeout(identityTimer);
      identityTimer = null;
      if (detailsTimer) clearTimeout(detailsTimer);
      detailsTimer = null;
      if (!cancelled) setOnline(false);
    });

    socket.on("server:identity", (payload: { proof?: string }) => {
      void settleIdentity(payload?.proof);
    });

    socket.on("token:refreshed", ({ accessToken, fileToken }: { accessToken: string; fileToken?: string }) => {
      adopt(accessToken);
      settleRefresh(accessToken);
      void readTokens(host).then((current) => {
        void writeTokens(host, {
          accessToken,
          refreshToken: current?.refreshToken,
          // A file token outlives an access token by hours. Falling back to the
          // stored one keeps that true against a server too old to send a new one.
          fileToken: fileToken ?? current?.fileToken,
        });
        scheduleRefresh(accessToken, current?.refreshToken);
      });
    });

    /**
     * The session is over and no token will fix it. **Throwing the stored pair
     * away matters**: kept, every launch presents a credential that cannot work.
     */
    for (const event of ["token:revoked", "token:invalid", "server:kicked"]) {
      socket.on(event, () => {
        void clearTokens(host);
        if (!cancelled) {
          setMe(null);
          setOnline(false);
        }
        set({
          status: "error",
          message: "This server ended the session. Open it again to rejoin.",
        });
        socket.disconnect();
      });
    }

    socket.on("server:details", (details: ServerDetails) => {
      if (detailsTimer) clearTimeout(detailsTimer);
      detailsTimer = null;

      if (details?.error === "join_required") {
        /**
         * The token was not accepted — revoked, expired past refresh, or the
         * server's token version moved. Drop it and join as if this were new.
         */
        void clearTokens(host).then(() => {
          if (!cancelled) void join();
        });
        return;
      }
      if (details?.error) {
        set({ status: "error", message: `The server refused: ${details.error}` });
        return;
      }
      set({
        status: "ready",
        channels: details?.channels ?? [],
        sidebar: details?.sidebar_items ?? [],
        details: details?.server_info,
        stunHosts: details?.stun_hosts ?? [],
      });

      /**
       * Say what key to encrypt to us here. **On `server:details`, not on the
       * join**: `server:joined` never fires for a restore. Once per connection.
       */
      if (!dmKeyPublished) {
        dmKeyPublished = true;
        void publishDmKey(socket, host);
      }
    });

    socket.on("connect_error", (err: Error) => {
      /**
       * Only the first connection failing is an error worth a screen. Later this
       * fires on every attempt, and `status: "error"` blanks what is on screen.
       */
      if (established) return;

      /**
       * A CORS allowlist that does not know this app lands here as a bare
       * "websocket error". **Only when `/info` answered this run** (GRYT-522).
       */
      set({
        status: "error",
        message:
          err?.message !== "websocket error"
            ? err?.message || "Could not reach this server."
            : confirmed
              ? ORIGIN_HINT
              : `Could not open a connection to ${host}. It may be offline, or not reachable from this network.`,
      });

      /**
       * A server that is down and one that is refusing the socket both arrive as
       * "websocket error", so ask. Once per mount, and only from storage.
       */
      if (probed || confirmed || !getRememberedScheme(host)) return;
      probed = true;
      void fetchServerInfo(host).then((result) => {
        if (cancelled || established) return;
        if (result.kind === "error" || result.kind === "superseded") return;
        set({ status: "error", message: ORIGIN_HINT });
      });
    });

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (identityTimer) clearTimeout(identityTimer);
      if (detailsTimer) clearTimeout(detailsTimer);
      // Anything waiting on a token is waiting on a socket that is going away.
      settleRefresh(null);
      accessTokenRef.current = async () => null;
      rejoinRef.current = async () => {};
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setOnline(false);
    };
    /* `nickname` is deliberately not here — see `nicknameRef` above. */
  }, [host, scheme, confirmed]);

  /* Memoised, and it matters with one of these per joined server: a fresh object
   * every render publishes into the registry, which re-renders every connection. */
  return useMemo(
    () => ({ state, socket, me, getAccessToken, online, rejoin }),
    [state, socket, me, getAccessToken, online, rejoin],
  );
}
