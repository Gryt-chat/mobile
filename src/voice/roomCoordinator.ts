import type { RoomAccess, RoomCoordinator } from "@gryt/voice/native";
import type { Socket } from "socket.io-client";

/* The app's half of the voice seam.
 *
 * `@gryt/voice` knows how to talk to an SFU and nothing about how a Gryt server
 * grants access to one. That is this: seven members, each a translation between
 * the engine's vocabulary and a `voice:*` socket event.
 *
 * Written against the server's handlers rather than copied from the desktop
 * client, because there is nothing to copy — `packages/client` does not depend
 * on `@gryt/voice` and still runs its own in-tree engine. This is the package's
 * first embedder.
 */

/** What the server sends back when it grants a room. */
interface GrantedPayload {
  room_id?: string;
  join_token?: unknown;
  sfu_url?: string;
  sfu_urls?: string[];
}

/** Refusals arrive as a bare string on older paths and an object on the rest. */
type RoomErrorPayload = string | { error?: string; message?: string; retryAfterMs?: number };

/** How long to wait for a grant before treating the silence as a refusal. */
const ACCESS_TIMEOUT_MS = 10_000;

function refusal(payload: RoomErrorPayload): RoomAccess {
  if (typeof payload === "string") return { granted: false, reason: payload };
  return {
    granted: false,
    reason: payload?.message || payload?.error || "The server refused voice access.",
    retryAfterMs: payload?.retryAfterMs,
  };
}

/**
 * The candidate URLs, as candidates.
 *
 * `sfu_urls` is the list and `sfu_url` is its first element, kept for clients
 * that only ever read one. Passing the single one through would be throwing
 * away the probing the engine does — `selectBestSfuUrl` exists precisely
 * because the nearest SFU is not knowable from here.
 */
function urlsFrom(payload: GrantedPayload): string[] {
  if (Array.isArray(payload.sfu_urls) && payload.sfu_urls.length > 0) return payload.sfu_urls;
  return payload.sfu_url ? [payload.sfu_url] : [];
}

export function createRoomCoordinator(socket: Socket, host: string): RoomCoordinator {
  const reconnectHandlers = new Set<() => void>();

  socket.on("connect", () => {
    for (const handler of [...reconnectHandlers]) handler();
  });

  return {
    requestAccess(channelId: string): Promise<RoomAccess> {
      return new Promise<RoomAccess>((resolve) => {
        let settled = false;
        const done = (access: RoomAccess) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket.off("voice:room:granted", onGranted);
          socket.off("voice:room:error", onError);
          resolve(access);
        };

        const onGranted = (payload: GrantedPayload) => {
          const sfuUrls = urlsFrom(payload);
          if (!payload?.room_id || sfuUrls.length === 0) {
            /* A grant with nowhere to go is not a grant. Treated as a refusal
             * rather than passed on, because the engine would otherwise probe
             * an empty list and report a connection failure for what is really
             * a server with no SFU configured. */
            done({ granted: false, reason: "The server granted voice access without an SFU to connect to." });
            return;
          }
          done({
            granted: true,
            roomId: payload.room_id,
            joinToken: payload.join_token,
            sfuUrls,
            // The engine caches its chosen URL against this, so a reconnect
            // skips the probing. Opaque to it; the host is what varies.
            cacheKey: host,
          });
        };

        const onError = (payload: RoomErrorPayload) => done(refusal(payload));

        const timer = setTimeout(
          () => done({ granted: false, reason: "The server did not answer the request for voice access." }),
          ACCESS_TIMEOUT_MS,
        );

        socket.on("voice:room:granted", onGranted);
        socket.on("voice:room:error", onError);
        socket.emit("voice:room:request", channelId);
      });
    },

    leave() {
      socket.emit("voice:room:leave");
    },

    announceJoined(joined: boolean) {
      socket.emit("voice:channel:joined", joined);
    },

    setLocalStream(streamId: string | null) {
      // The server's handler takes a string; empty is how it is cleared.
      socket.emit("voice:stream:set", streamId ?? "");
    },

    peerChanged(streamId: string, present: boolean) {
      socket.emit(present ? "voice:peer:connected" : "voice:peer:disconnected", streamId);
    },

    get connected() {
      return socket.connected;
    },

    onReconnected(handler: () => void) {
      reconnectHandlers.add(handler);
      return () => reconnectHandlers.delete(handler);
    },
  };
}
