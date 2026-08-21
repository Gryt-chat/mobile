import { describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";

import { createRoomCoordinator } from "./roomCoordinator";

/** Enough of a socket to record emits and play events back. */
function fakeSocket(connected = true) {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const sent: [string, unknown][] = [];

  const socket = {
    connected,
    emit: (event: string, payload?: unknown) => {
      sent.push([event, payload]);
      return socket;
    },
    on: (event: string, fn: (payload: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
      return socket;
    },
    off: (event: string, fn: (payload: unknown) => void) => {
      handlers.get(event)?.delete(fn);
      return socket;
    },
  };

  return {
    socket: socket as unknown as Socket,
    sent,
    events: () => sent.map(([e]) => e),
    fire: (event: string, payload?: unknown) => {
      for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
    },
    listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
  };
}

const GRANT = {
  room_id: "room-1",
  join_token: { t: "opaque" },
  sfu_url: "wss://one.example",
  sfu_urls: ["wss://one.example", "wss://two.example"],
};

describe("requestAccess", () => {
  it("asks the server for the channel, and maps a grant onto RoomAccess", async () => {
    const f = fakeSocket();
    const room = createRoomCoordinator(f.socket, "gryt.chat");

    const pending = room.requestAccess("voice-1");
    expect(f.sent).toContainEqual(["voice:room:request", "voice-1"]);

    f.fire("voice:room:granted", GRANT);
    await expect(pending).resolves.toEqual({
      granted: true,
      roomId: "room-1",
      joinToken: { t: "opaque" },
      sfuUrls: ["wss://one.example", "wss://two.example"],
      cacheKey: "gryt.chat",
    });
  });

  /* Handing over one chosen URL would throw away the probing the engine does,
   * which is the whole reason it takes a list. */
  it("passes every candidate URL through, not just the first", async () => {
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    f.fire("voice:room:granted", GRANT);
    expect((await pending).sfuUrls).toHaveLength(2);
  });

  it("falls back to the singular url for a server that only sends one", async () => {
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    f.fire("voice:room:granted", { room_id: "r", sfu_url: "wss://only.example" });
    expect((await pending).sfuUrls).toEqual(["wss://only.example"]);
  });

  /* Otherwise the engine probes an empty list and reports a connection
   * failure, for what is really a server with no SFU configured. */
  it("treats a grant with nowhere to go as a refusal", async () => {
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    f.fire("voice:room:granted", { room_id: "r", sfu_urls: [] });
    const access = await pending;
    expect(access.granted).toBe(false);
    expect(access.reason).toMatch(/without an SFU/);
  });

  it("reads a refusal sent as an object, including the retry hint", async () => {
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    f.fire("voice:room:error", { error: "rate_limited", message: "Too fast. Wait 3s.", retryAfterMs: 3000 });
    await expect(pending).resolves.toEqual({
      granted: false,
      reason: "Too fast. Wait 3s.",
      retryAfterMs: 3000,
    });
  });

  it("reads a refusal sent as a bare string", async () => {
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    f.fire("voice:room:error", "Voice service unavailable");
    expect((await pending).reason).toBe("Voice service unavailable");
  });

  it("gives up rather than hanging when the server never answers", async () => {
    vi.useFakeTimers();
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    vi.advanceTimersByTime(10_000);
    const access = await pending;
    vi.useRealTimers();
    expect(access.granted).toBe(false);
    expect(access.reason).toMatch(/did not answer/);
  });

  /* One request leaving its listeners behind would mean the next request's
   * grant resolving this one too. */
  it("takes its listeners off once settled", async () => {
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    expect(f.listenerCount("voice:room:granted")).toBe(1);
    f.fire("voice:room:granted", GRANT);
    await pending;
    expect(f.listenerCount("voice:room:granted")).toBe(0);
    expect(f.listenerCount("voice:room:error")).toBe(0);
  });

  it("ignores a second answer for the same request", async () => {
    const f = fakeSocket();
    const pending = createRoomCoordinator(f.socket, "h").requestAccess("v");
    f.fire("voice:room:granted", GRANT);
    f.fire("voice:room:error", "too late");
    expect((await pending).granted).toBe(true);
  });
});

describe("the one-line members", () => {
  it("mirror their events", () => {
    const f = fakeSocket();
    const room = createRoomCoordinator(f.socket, "h");

    room.leave();
    room.announceJoined(true);
    room.setLocalStream("stream-9");
    room.peerChanged("peer-1", true);
    room.peerChanged("peer-1", false);

    expect(f.sent).toEqual([
      ["voice:room:leave", undefined],
      ["voice:channel:joined", true],
      ["voice:stream:set", "stream-9"],
      ["voice:peer:connected", "peer-1"],
      ["voice:peer:disconnected", "peer-1"],
    ]);
  });

  /* The server's handler takes a string, so clearing is an empty one rather
   * than a null it would have to be taught about. */
  it("clears the local stream with an empty string", () => {
    const f = fakeSocket();
    createRoomCoordinator(f.socket, "h").setLocalStream(null);
    expect(f.sent).toEqual([["voice:stream:set", ""]]);
  });
});

describe("signalling state", () => {
  it("reports whether the socket is up, live rather than at construction", () => {
    const f = fakeSocket(true);
    const room = createRoomCoordinator(f.socket, "h");
    expect(room.connected).toBe(true);

    (f.socket as unknown as { connected: boolean }).connected = false;
    expect(room.connected).toBe(false);
  });

  it("tells the engine when signalling comes back", () => {
    const f = fakeSocket();
    const room = createRoomCoordinator(f.socket, "h");
    const seen = vi.fn();

    const stop = room.onReconnected(seen);
    f.fire("connect");
    expect(seen).toHaveBeenCalledTimes(1);

    stop();
    f.fire("connect");
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
