import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { createClientNonce, evaluateServerProof } from "../identity/serverProof";
import { getServerWsBase } from "../servers/address";
import { identityFrom, type SessionIdentity } from "./claims";
import { msUntilRefresh, shouldRefresh } from "./expiry";
import { guardSocket } from "./guard";
import { JoinError, joinServer } from "./join";
import { getPin, savePin } from "./pins";
import { clearTokens, readTokens, writeTokens } from "./tokens";
import type { ConnectionState, ServerDetails } from "./types";

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
 * Connect to one server, prove it is the right one, join, and read its
 * channels.
 *
 * The order is not negotiable and the reason is the middle step. Everything
 * after `server:identify` is held back by the guard until the proof settles, so
 * nothing — not a token, not an assertion — reaches a machine that has not been
 * checked against what was pinned last time.
 *
 * A second launch does not join again. `server:joined` hands back an access and
 * a refresh token, both kept in the Keychain, and `session:restore` is what a
 * socket presents next time — the join is the expensive path and it is only for
 * a server this device has never been a member of.
 *
 * Reconnection is off. A dropped socket that silently re-runs all of this is a
 * lot of behaviour to get right, and none of it is needed to answer the
 * question this piece exists to answer. GRYT-415.
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
}

export function useConnection(host: string | null, nickname: string): Connection {
  const [state, setState] = useState<ConnectionState>({ status: "idle" });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [me, setMe] = useState<SessionIdentity | null>(null);
  const socketRef = useRef<Socket | null>(null);

  /* The implementation lives inside the effect, where the socket and the host
   * are. The ref is what keeps the function handed out stable across renders,
   * so a component depending on it does not re-run on every reconnect. */
  const accessTokenRef = useRef<() => Promise<string | null>>(async () => null);
  const getAccessToken = useCallback(() => accessTokenRef.current(), []);

  useEffect(() => {
    if (!host) {
      setState({ status: "idle" });
      setMe(null);
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

    const socket = io(getServerWsBase(host), {
      // Only websocket. React Native handles socket.io's polling transport
      // badly, and the desktop client does not use it either.
      transports: ["websocket"],
      reconnection: false,
      timeout: 10_000,
    });
    socketRef.current = socket;
    setSocket(socket);

    const guard = guardSocket(socket);
    let identitySettled = false;

    const settleIdentity = async (proof?: string) => {
      if (identitySettled || cancelled) return;
      identitySettled = true;

      const pinned = await getPin(host);
      const decision = evaluateServerProof({ proof, sentNonce: nonce, pinned });

      if (decision.action === "block") {
        guard.refuse();
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

      set({ status: "joining" });

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
        socket.emit("server:details");
        return;
      }

      await join();
    };

    /** The expensive path: only for a server this device has never joined. */
    const join = async () => {
      try {
        const joined = await joinServer(socket, host, { nickname });
        if (cancelled) return;

        await writeTokens(host, {
          accessToken: joined.accessToken,
          refreshToken: joined.refreshToken,
        });
        adopt(joined.accessToken);
        scheduleRefresh(joined.accessToken, joined.refreshToken);

        // The channel list comes back on this, and only to a socket that has
        // joined — an unjoined one gets `{error: "join_required"}`.
        socket.emit("server:details");
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

    accessTokenRef.current = async () => {
      const stored = await readTokens(host);
      if (!stored) return null;
      if (!shouldRefresh(stored.accessToken) || !stored.refreshToken) {
        return stored.accessToken;
      }
      return (await refreshNow(stored.refreshToken)) ?? stored.accessToken;
    };

    const nonce = createClientNonce(Crypto.getRandomBytes(32));

    socket.on("connect", () => {
      socket.emit("server:identify", { clientNonce: nonce });
      // An older server has no handler for that and will never answer. Silence
      // is "offered no proof", which is fine for an address never pinned and a
      // refusal for one that was.
      setTimeout(() => void settleIdentity(undefined), IDENTITY_TIMEOUT_MS);
    });

    socket.on("server:identity", (payload: { proof?: string }) => {
      void settleIdentity(payload?.proof);
    });

    socket.on("token:refreshed", ({ accessToken }: { accessToken: string }) => {
      adopt(accessToken);
      settleRefresh(accessToken);
      void readTokens(host).then((current) => {
        void writeTokens(host, { accessToken, refreshToken: current?.refreshToken });
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
        if (!cancelled) setMe(null);
        set({
          status: "error",
          message: "This server ended the session. Open it again to rejoin.",
        });
        socket.disconnect();
      });
    }

    socket.on("server:details", (details: ServerDetails) => {
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
      });
    });

    socket.on("connect_error", (err: Error) => {
      /**
       * A server whose CORS allowlist does not know this app lands here as a
       * bare "websocket error", which says nothing about why. React Native's
       * WebSocket sends `Origin: http://<host>`, and a server older than
       * GRYT-413 refuses it — so this is the most likely cause by far, and
       * worth naming rather than leaving somebody to find it the way I did.
       */
      set({
        status: "error",
        message:
          err?.message === "websocket error"
            ? "The server closed the connection. If it is older than 1.4.7 it may be refusing this app's origin."
            : err?.message || "Could not reach this server.",
      });
    });

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      // Anything waiting on a token is waiting on a socket that is going away.
      settleRefresh(null);
      accessTokenRef.current = async () => null;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [host, nickname]);

  return { state, socket, me, getAccessToken };
}
