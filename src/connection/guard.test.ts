import { describe, expect, it } from "vitest";

import { guardSocket } from "./guard";
import type { Socket } from "socket.io-client";

/** Enough of a socket for the guard: something to record emits and a flag to flip. */
function fakeSocket() {
  const sent: [string, ...unknown[]][] = [];
  const socket = {
    emit: (event: string, ...args: unknown[]) => {
      sent.push([event, ...args]);
      return socket;
    },
    io: { opts: { reconnection: true } },
    disconnected: false,
    disconnect: () => {
      socket.disconnected = true;
      return socket;
    },
  };
  return { socket, sent, events: () => sent.map(([e]) => e) };
}

describe("guardSocket", () => {
  it("holds everything back until the server has proved itself", () => {
    const { socket, events } = fakeSocket();
    const guard = guardSocket(socket as unknown as Socket);

    socket.emit("session:restore", { accessToken: "t" });
    socket.emit("server:details");
    expect(events()).toEqual([]);

    guard.release();
    expect(events()).toEqual(["session:restore", "server:details"]);
  });

  it("lets the proof request itself through", () => {
    const { socket, events } = fakeSocket();
    guardSocket(socket as unknown as Socket);

    socket.emit("server:identify", { clientNonce: "n" });
    expect(events()).toEqual(["server:identify"]);
  });

  it("keeps the arguments and the order", () => {
    const { socket, sent } = fakeSocket();
    const guard = guardSocket(socket as unknown as Socket);

    socket.emit("chat:fetch", { conversationId: "general" });
    socket.emit("chat:send", { text: "hello" });
    guard.release();

    expect(sent).toEqual([
      ["chat:fetch", { conversationId: "general" }],
      ["chat:send", { text: "hello" }],
    ]);
  });

  it("passes straight through once released", () => {
    const { socket, events } = fakeSocket();
    const guard = guardSocket(socket as unknown as Socket);
    guard.release();

    socket.emit("chat:send", { text: "hello" });
    expect(events()).toEqual(["chat:send"]);
  });

  /* The reconnect case. A dropped socket has to earn its release again, or the
   * next connection to that address inherits the trust the last one earned. */
  it("queues again after a hold, and releases only what came after", () => {
    const { socket, events } = fakeSocket();
    const guard = guardSocket(socket as unknown as Socket);

    guard.release();
    socket.emit("chat:fetch", {});
    expect(events()).toEqual(["chat:fetch"]);

    guard.hold();
    socket.emit("chat:send", {});
    expect(events()).toEqual(["chat:fetch"]);

    guard.release();
    expect(events()).toEqual(["chat:fetch", "chat:send"]);
  });

  it("still lets the proof request through while held again", () => {
    const { socket, events } = fakeSocket();
    const guard = guardSocket(socket as unknown as Socket);
    guard.release();
    guard.hold();

    socket.emit("server:identify", { clientNonce: "n2" });
    socket.emit("server:details");
    expect(events()).toEqual(["server:identify"]);
  });

  it("drops the queue and stops reconnecting when the server is refused", () => {
    const { socket, events } = fakeSocket();
    const guard = guardSocket(socket as unknown as Socket);

    socket.emit("session:restore", {});
    guard.refuse();

    expect(events()).toEqual([]);
    expect(socket.io.opts.reconnection).toBe(false);
    expect(socket.disconnected).toBe(true);
  });

  /* Refusing has to leave the guard closed. An impostor that gets the socket
   * released would have everything queued behind it handed over. */
  it("does not release what was queued before a refusal", () => {
    const { socket, events } = fakeSocket();
    const guard = guardSocket(socket as unknown as Socket);

    socket.emit("session:restore", {});
    guard.refuse();
    socket.emit("server:details");

    expect(events()).toEqual([]);
  });
});
