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
 *
 * React Native's WebSocket sends `Origin: http://<host>`, and a server older
 * than GRYT-413 refuses it. Only said where `/info` has answered, because on a
 * server nothing has reached it is a guess — which is what GRYT-522 was.
 */
const ORIGIN_HINT =
  "The server closed the connection. If it is older than 1.4.7 it may be refusing this app's origin.";

/** How long to give the server to answer `server:identify`. */
const IDENTITY_TIMEOUT_MS = 5000;

/**
 * How long to wait for a token asked for on demand.
 *
 * Short, because something is being held up behind it — a message somebody has
 * pressed send on. When it runs out the token already held is used anyway: it
 * is asked for five minutes before it expires, so it is very probably still
 * good, and letting the server say no is better than refusing to try.
 */
const REFRESH_TIMEOUT_MS = 4000;

/**
 * How hard to try to get back: forever, with a ceiling on the gap. A phone
 * loses its socket constantly, so giving up after N tries means the app is dead
 * in exactly the situation it was written for. The randomisation is what stops
 * a server coming back up getting every client in the same instant.
 */
/**
 * How long to let a session restore finish before asking for the channel list.
 *
 * Generous on purpose: it is only ever waited out when the restore produced
 * nothing, and paying a couple of seconds in that case is much better than
 * asking too early — see the note at the call site.
 */
const RESTORE_GRACE_MS = 2500;

const RECONNECT = {
  reconnection: true,
  reconnectionDelay: 800,
  reconnectionDelayMax: 8000,
  randomizationFactor: 0.5,
} as const;

/**
 * Connect to one server, prove it is the right one, join, and read its
 * channels.
 *
 * **The order is not negotiable.** Everything after `server:identify` is held
 * back by the guard until the proof settles, so no token and no assertion
 * reaches a machine that has not been checked against what was pinned.
 *
 * A second launch restores a session rather than joining again — the join is
 * the expensive path, only for a server this device has never been a member of.
 *
 * A reconnect re-runs the whole handshake with a fresh nonce. It is a new
 * connection to whatever answers that address now, and all the previous one
 * established is what to check it against (GRYT-415).
 */
export interface Connection {
  state: ConnectionState;
  /**
   * The live socket, or null before one exists.
   *
   * Handed out so a screen can talk to the server it is already connected to.
   * It is deliberately the same socket rather than a second one: a join is per
   * connection, so a second socket would be a second unauthenticated client
   * that has to do the whole handshake again to say one thing.
   */
  socket: Socket | null;
  /**
   * Who this device is on this server, read from the access token's claims.
   *
   * Null until a session exists. Anything drawn before the server has answered
   * — a message you have just sent, most of all — needs the same sender id the
   * real one will carry, and this is where it comes from without a round trip.
   */
  me: SessionIdentity | null;
  /**
   * The access token to put in a payload, refreshed first if it is due.
   *
   * Events like `chat:send` carry the token themselves; having joined does not
   * authenticate the socket for them. The refresh timer usually keeps the
   * stored one current, but it is a `setTimeout` and a backgrounded phone does
   * not run those, so the token is checked at the moment it is needed too.
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * Connected *and* past the proof — safe to send something on. Separate from
   * `state` because a reconnect must not blank the screen: the channel list and
   * messages stay put while this goes false.
   */
  online: boolean;
  /**
   * Throw the session away and join again from scratch, for the one case that
   * needs it: letting an account take over the guest membership. The decision
   * is read when a challenge is answered, and a stored token is what makes the
   * next connect a restore rather than a join (GRYT-502).
   */
  rejoin: () => Promise<void>;
}

export function useConnection(
  host: string | null,
  nickname: string,
  /**
   * How to dial this host, from `useServerScheme`.
   *
   * `scheme` is null while that is still being worked out, and nothing opens a
   * socket until it is not: a WebSocket has no redirect to follow, so guessing
   * here is a dead transport rather than a retry. GRYT-499.
   */
  address: { scheme: Scheme | null; confirmed: boolean },
  /**
   * The account's access token, if signed in.
   *
   * A function rather than a value so the join asks at the moment it needs one
   * — which is also the moment a stale one gets refreshed. Passing the token
   * itself would capture whatever was current when the socket opened.
   */
  getAccountToken?: () => Promise<string | null>,
): Connection {
  const [state, setState] = useState<ConnectionState>({ status: "idle" });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [me, setMe] = useState<SessionIdentity | null>(null);
  const [online, setOnline] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  /* The implementation lives inside the effect, where the socket and the host
   * are. The ref is what keeps the function handed out stable across renders,
   * so a component depending on it does not re-run on every reconnect. */
  const accessTokenRef = useRef<() => Promise<string | null>>(async () => null);
  const getAccessToken = useCallback(() => accessTokenRef.current(), []);

  /* Same shape as `accessTokenRef`: the implementation is inside the effect
   * where the socket is, and the ref is what keeps the handed-out function
   * stable so a consumer does not re-render on every reconnect. */
  const rejoinRef = useRef<() => Promise<void>>(async () => {});
  const rejoin = useCallback(() => rejoinRef.current(), []);

  /**
   * The nickname is read at join time and nowhere else, so **it is a ref rather
   * than a dependency of the effect below** — as a dependency, the default
   * arriving from storage a moment after first render reconnected the app on
   * every launch.
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
      /* Waiting on `/info` to say whether this server is http or https. It is
       * a connecting state rather than an idle one because that is what it is
       * — the alternative is a blank screen for the length of one request. */
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

      /* A reconnect keeps whatever is on screen. Dropping back to a spinner
       * because the wifi blinked would throw away a channel the reader is in
       * the middle of, and `server:details` refreshes it a moment later
       * anyway. */
      if (!established) set({ status: "joining" });

      const stored = await readTokens(host);

      if (stored) {
        /**
         * Already a member here. Present the token rather than joining again.
         *
         * A stale one is fine to send: `session:restore` either works or the
         * `server:details` that follows comes back `join_required`, which is
         * handled below by refreshing or joining. Checking expiry first only
         * saves a round trip in the case where it has definitely run out.
         */
        adopt(stored.accessToken);
        if (shouldRefresh(stored.accessToken) && stored.refreshToken) {
          socket.emit("token:refresh", { refreshToken: stored.refreshToken });
        }
        socket.emit("session:restore", { accessToken: stored.accessToken });

        /**
         * **Do not ask for the channel list here.** The server sends it once
         * the restore finishes, and a `server:details` in the same breath is
         * answered before that lands, with `join_required` — so the client
         * cleared a good token and redid the whole handshake. It looked like it
         * worked, because rejoining does work.
         *
         * The timer is for the other case: a token the server rejects outright
         * produces no answer at all.
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
         * about the identity service and reads that way. A phone that cannot
         * reach it, or whose account has gone, still joins as a guest wherever
         * that is allowed — losing the account tier is better than losing the
         * server. */
        let accountCertificate: AccountCertificate | undefined;
        try {
          const token = (await getAccountToken?.()) ?? null;
          accountCertificate = (await getAccountCertificate(host, token)) ?? undefined;
        } catch (err) {
          console.warn("[Account] Could not get an identity certificate:", err);
        }

        /* Read here rather than inside the join, for the same reason the
         * certificate is: the answer lives in storage, and a join that quietly
         * reads things of its own fails for reasons the caller cannot see.
         * False unless somebody has said yes for this server — see
         * `claimPriorMembership`. */
        const scope = identityScopeFor(host);
        const claimPriorMembership = accountCertificate ? await mayClaim(scope) : false;

        /* Read here for the same reason the certificate is. A server whose
         * `join_policy` is `invite` refuses a join that carries no code, and the
         * code arrived in the link that opened the Add-a-server sheet — long
         * gone by the time this runs, which is why it is in storage at all.
         *
         * Only this path spends it. A reconnect restores a session rather than
         * joining, so a limited invite is not drained by a flaky network.
         * GRYT-845. */
        const inviteCode = await readInviteCode(host);

        const joined = await joinServer(socket, host, {
          nickname: nicknameRef.current,
          accountCertificate,
          claimPriorMembership,
          inviteCode,
          /* A guest join is what makes this device able to claim something here
           * later. Recorded locally so the question "is there anything to
           * claim?" can be answered without asking the server — which cannot be
           * asked without telling it the answer. */
          onIdentityUsed: (tier) => {
            if (tier === "local") void rememberGuestScope(scope);
            /* And the other side of the same question. A membership made with
             * the account belongs to the account, so signing out has to take it
             * — and this is the only moment anything knows which kind it was.
             * GRYT-572. */
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
     * Ask for a new access token shortly before this one stops working.
     *
     * A timer rather than a check on each use: nothing here polls the server,
     * so there is no natural moment to notice. Cleared on unmount with
     * everything else.
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
     * A refresh somebody is waiting on, rather than one on a timer.
     *
     * `token:refresh` answers on an event, not a callback, so the waiting is
     * done here: everyone who asks while one is in flight gets the same answer,
     * and one that never comes back settles as null rather than hanging.
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
       * already-open socket ignores it, and the whole point is to go round the
       * handshake again with no token to restore from. */
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
     * Prove this connection, whichever number it is.
     *
     * The nonce is regenerated every time and that is the point of doing this
     * per connection rather than once: a nonce reused across connections makes
     * the proof replayable, so anything that recorded the first answer could
     * satisfy the second.
     */
    const beginHandshake = () => {
      identitySettled = false;
      nonce = createClientNonce(Crypto.getRandomBytes(32));
      socket.emit("server:identify", { clientNonce: nonce });
      // An older server has no handler for that and will never answer. Silence
      // is "offered no proof", which is fine for an address never pinned and a
      // refusal for one that was.
      if (identityTimer) clearTimeout(identityTimer);
      identityTimer = setTimeout(() => void settleIdentity(undefined), IDENTITY_TIMEOUT_MS);
    };

    socket.on("connect", beginHandshake);

    /**
     * Start queueing again the moment the socket goes, not when it comes back.
     *
     * socket.io buffers whatever is emitted while disconnected and flushes it
     * on reconnect, which would put it on the wire before the new server has
     * been checked. Arming here means those emits sit in the guard's queue
     * instead, and nothing has to remember to re-arm in the right order.
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
          // A file token outlives an access token by hours, so a session that
          // keeps refreshing never reaches the point where its pictures stop
          // loading. Falling back to the stored one keeps that true against a
          // server too old to send a new one.
          fileToken: fileToken ?? current?.fileToken,
        });
        scheduleRefresh(accessToken, current?.refreshToken);
      });
    });

    /**
     * The session is over and no token will fix it — the member was removed,
     * or the server rotated everyone's tokens.
     *
     * Throwing the stored pair away matters: keeping them means every launch
     * presents a credential that cannot work, and the app looks broken rather
     * than logged out. The next attempt joins fresh.
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
         * The token was not accepted. That is the ordinary end of a membership
         * — revoked, expired past refresh, or the server's token version moved
         * — so drop it and join as if this were a new server.
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
       * Say what key to encrypt to us here (GRYT-727). **On `server:details`,
       * not on the join** — that is the one signal both paths produce, and
       * `server:joined` never fires for a device restoring a session, so
       * publishing there leaves every existing member without a key.
       *
       * Once per connection: the server rate-limits this to five a minute, and
       * `server:details` arrives again whenever the server changes.
       */
      if (!dmKeyPublished) {
        dmKeyPublished = true;
        void publishDmKey(socket, host);
      }
    });

    socket.on("connect_error", (err: Error) => {
      /**
       * Only the first connection failing is an error worth a screen. After a
       * session is established this fires on every reconnection attempt, and
       * `status: "error"` throws away the channel list and messages the reader
       * is looking at while the socket is quietly still trying.
       */
      if (established) return;

      /**
       * A server whose CORS allowlist does not know this app lands here as a
       * bare "websocket error". React Native's WebSocket sends
       * `Origin: http://<host>`, and a server older than GRYT-413 refuses it.
       *
       * **Only when the scheme was confirmed** (GRYT-499), and confirmed means
       * `/info` answered *this run* (GRYT-522). Otherwise the transport may
       * have died before the server saw an `Origin` header at all, and this
       * guess is printed as the likeliest cause.
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
       * A server that is down and one that is up and refusing the socket both
       * arrive as "websocket error", so ask.
       *
       * Once per mount, and only with a scheme out of storage: a server being
       * looked at for the first time was already asked by `useServerScheme`.
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

  /* Memoised, and it matters now that there is one of these per joined server.
   * `ConnectionsProvider` publishes each into a registry from an effect; a
   * fresh object every render would publish on every render, which sets state
   * in the provider, which re-renders every connection. Held to the values that
   * actually change — `getAccessToken` and `rejoin` are already stable refs. */
  return useMemo(
    () => ({ state, socket, me, getAccessToken, online, rejoin }),
    [state, socket, me, getAccessToken, online, rejoin],
  );
}
