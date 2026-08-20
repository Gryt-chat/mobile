import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { createClientNonce, evaluateServerProof } from "../identity/serverProof";
import { getServerWsBase } from "../servers/address";
import { guardSocket } from "./guard";
import { JoinError, joinServer } from "./join";
import { getPin, savePin } from "./pins";
import type { ConnectionState, ServerDetails } from "./types";

/** How long to give the server to answer `server:identify`. */
const IDENTITY_TIMEOUT_MS = 5000;

/**
 * Connect to one server, prove it is the right one, join, and read its
 * channels.
 *
 * The order is not negotiable and the reason is the middle step. Everything
 * after `server:identify` is held back by the guard until the proof settles, so
 * nothing — not a token, not an assertion — reaches a machine that has not been
 * checked against what was pinned last time.
 *
 * Reconnection is off. A dropped socket that silently re-runs a join is a lot
 * of behaviour to get right, and none of it is needed to answer the question
 * this piece exists to answer, which is whether the handshake works at all.
 * GRYT-415.
 */
export function useConnection(host: string | null, nickname: string): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ status: "idle" });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!host) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    const set = (next: ConnectionState) => {
      if (!cancelled) setState(next);
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

      try {
        await joinServer(socket, host, { nickname });
        if (cancelled) return;
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

    socket.on("server:details", (details: ServerDetails) => {
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
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [host, nickname]);

  return state;
}
