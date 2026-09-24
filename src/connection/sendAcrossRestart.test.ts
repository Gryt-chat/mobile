import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A message sent across a server restart goes out once it is back, and once. The real
 * hook and guard, against a server that dies, comes back and restores late (GRYT-1453).
 */

/* Just enough of React to run one hook: state, refs, memoised callbacks and effects.
   `vi.hoisted` because `vi.mock` below runs before the imports. */
const react = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: (() => void) | void; current?: unknown };
  let slots: Slot[] = [];
  let cursor = 0;
  let pending: (() => void)[] = [];
  let render: (() => void) | null = null;
  let queued = false;
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      render?.();
    });
  };
  return {
    useState<T>(init: T | (() => T)) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => T)() : init };
      const slot = slots[i];
      const set = (next: T | ((prev: T) => T)) => {
        const value = typeof next === "function" ? (next as (prev: T) => T)(slot.value as T) : next;
        if (Object.is(value, slot.value)) return;
        slot.value = value;
        schedule();
      };
      return [slot.value as T, set] as const;
    },
    useRef<T>(init: T) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: init };
      return slots[i] as { current: T };
    },
    useCallback<T>(fn: T, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn, deps };
      return slots[i].value as T;
    },
    useMemo<T>(fn: () => T, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value as T;
    },
    useEffect(fn: () => (() => void) | void, deps?: unknown[]) {
      const i = cursor++;
      const prev = slots[i];
      if (prev && !changed(prev.deps, deps)) return;
      slots[i] = { deps, cleanup: prev?.cleanup };
      pending.push(() => {
        if (typeof slots[i].cleanup === "function") (slots[i].cleanup as () => void)();
        slots[i].cleanup = fn();
      });
    },
    mount<T>(hook: () => T): { current: () => T; unmount: () => void } {
      let result: T;
      slots = [];
      render = () => {
        cursor = 0;
        pending = [];
        result = hook();
        for (const effect of pending) effect();
      };
      render();
      return {
        current: () => result,
        unmount: () => {
          for (const slot of slots) if (typeof slot?.cleanup === "function") slot.cleanup();
          render = null;
        },
      };
    },
  };
});

vi.mock("react", () => ({
  useState: react.useState,
  useRef: react.useRef,
  useCallback: react.useCallback,
  useMemo: react.useMemo,
  useEffect: react.useEffect,
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("../chat/files", () => ({ attachmentUrl: () => "" }));
vi.mock("../chat/sealedAttachments", () => ({
  materialiseSealedAttachment: async () => null,
  sealedAttachmentMeta: () => null,
}));

import type { Socket } from "socket.io-client";

import { guardSocket } from "./guard";
import type { LocalMessage } from "./outbox";
import { useMessages } from "./useMessages";

type Listener = (...args: unknown[]) => void;

/**
 * The server, as far as a send can tell: a database that survives a restart, and a
 * socket that is nobody until its session is restored.
 */
class Server {
  up = true;
  identified = false;
  rows: { message_id: string; nonce?: string; sender: string; text: string; created_at: string }[] = [];
  /** Tests flip these to lose a frame on the way, in either direction. */
  loseNextSend = false;
  swallowNextEcho = false;
  private clock = 0;
  private readonly socket: FakeSocket;

  constructor(socket: FakeSocket) {
    this.socket = socket;
  }

  receive(event: string, payload: Record<string, unknown>): void {
    if (!this.up) return;
    if (event === "server:identify") return this.socket.deliver("server:identity", {});
    if (event === "session:restore") {
      this.identified = true;
      return this.socket.deliver("server:details", { channels: [] });
    }
    if (event === "chat:fetch") {
      return this.socket.deliver("chat:history", {
        conversation_id: payload.conversationId,
        items: this.rows.map((r) => this.message(r)),
        hasMore: false,
      });
    }
    if (event !== "chat:send") return;
    if (this.loseNextSend) {
      this.loseNextSend = false;
      return;
    }
    const nonce = payload.nonce as string | undefined;
    const text = String(payload.text ?? "");
    // Nonce-derived ids: a resend finds the row the first attempt wrote, restart or not.
    let row = this.rows.find((r) => nonce && r.nonce === nonce);
    if (!row) {
      row = { message_id: `id-${this.rows.length + 1}`, nonce, sender: "me", text, created_at: new Date(++this.clock * 1000).toISOString() };
      this.rows.push(row);
    }
    if (this.swallowNextEcho) {
      this.swallowNextEcho = false;
      return;
    }
    this.socket.deliver("chat:new", { ...this.message(row), nonce });
  }

  restart(): void {
    this.up = true;
    this.identified = false;
  }

  count(text: string): number {
    return this.rows.filter((r) => r.text === text).length;
  }

  private message(r: Server["rows"][number]) {
    return {
      conversation_id: "general",
      message_id: r.message_id,
      sender_server_id: r.sender,
      text: r.text,
      created_at: r.created_at,
      reactions: null,
      attachments: null,
      reply_to_message_id: null,
    };
  }
}

/** A socket.io client socket: it buffers while disconnected and flushes that before `connect`. */
class FakeSocket {
  connected = true;
  server = new Server(this);
  private listeners = new Map<string, Listener[]>();
  private buffer: [string, Record<string, unknown>][] = [];

  emit(event: string, payload: Record<string, unknown> = {}) {
    if (!this.connected) this.buffer.push([event, payload]);
    else queueMicrotask(() => this.server.receive(event, payload));
    return this;
  }
  on(event: string, cb: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), cb]);
    return this;
  }
  off(event: string, cb: Listener) {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== cb));
    return this;
  }
  deliver(event: string, payload: unknown) {
    queueMicrotask(() => {
      if (!this.connected) return;
      for (const cb of this.listeners.get(event) ?? []) cb(payload);
    });
  }
  fire(event: string, payload?: unknown) {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  }
  drop() {
    this.connected = false;
    this.server.up = false;
    this.fire("disconnect");
  }
  reconnect() {
    this.connected = true;
    const buffered = this.buffer.splice(0);
    for (const [event, payload] of buffered) queueMicrotask(() => this.server.receive(event, payload));
    this.fire("connect");
  }
  io = { opts: { reconnection: true } };
  disconnect() {
    return this;
  }
}

/** What useConnection does around the hook: prove the server, let the guard go, then restore. */
function connect(socket: FakeSocket, { holdRestore }: { holdRestore: () => boolean }) {
  const guard = guardSocket(socket as unknown as Socket);
  const held: (() => void)[] = [];
  const restore = () => socket.emit("session:restore", { accessToken: "token" });
  socket.on("connect", () => socket.emit("server:identify", { clientNonce: "n" }));
  socket.on("disconnect", () => guard.hold());
  socket.on("server:identity", () => {
    guard.release();
    if (holdRestore()) held.push(restore);
    else restore();
  });
  guard.release();
  return { releaseRestore: () => held.splice(0).forEach((f) => f()) };
}

function state(messages: LocalMessage[], text: string): string {
  const rows = messages.filter((m) => m.text === text);
  return rows.map((m) => (m.failed ? "failed" : m.pending ? (m.waiting ? "waiting" : "pending") : "sent")).join("+") || "none";
}

describe("a send across a server restart", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("goes out once for each of the four ways a restart can catch it", async () => {
    const socket = new FakeSocket();
    socket.server.identified = true;
    let holding = false;
    const connection = connect(socket, { holdRestore: () => holding });
    const hook = react.mount(() =>
      useMessages(socket as unknown as Socket, "general", {
        getAccessToken: async () => "token",
        me: { serverUserId: "me", nickname: "Me" } as never,
      }),
    );
    const settle = () => vi.advanceTimersByTimeAsync(10);
    await settle();

    const before = "said before the restart";
    hook.current().send(before);
    await settle();

    const unacked = "written but never echoed";
    socket.server.swallowNextEcho = true;
    hook.current().send(unacked);
    await settle();

    const lost = "lost on the way";
    socket.server.loseNextSend = true;
    hook.current().send(lost);
    await settle();

    socket.drop();
    const whileDown = "sent while the server was down";
    hook.current().send(whileDown);
    // A restart that takes as long as an update does: a pull, then a boot.
    await vi.advanceTimersByTimeAsync(20_000);
    for (const text of [unacked, lost, whileDown]) {
      expect(state(hook.current().messages, text), `"${text}" while the server is down`).toBe("waiting");
    }

    socket.server.restart();
    holding = true;
    socket.reconnect();
    await settle();
    const beforeRestore = "sent before the session was restored";
    hook.current().send(beforeRestore);
    await vi.advanceTimersByTimeAsync(3_000);
    holding = false;
    connection.releaseRestore();
    await vi.advanceTimersByTimeAsync(60_000);

    const texts = [before, unacked, lost, whileDown, beforeRestore];
    const seen = Object.fromEntries(texts.map((t) => [t, `${state(hook.current().messages, t)}, on the server ${socket.server.count(t)}`]));
    expect(seen).toEqual(Object.fromEntries(texts.map((t) => [t, "sent, on the server 1"])));
    expect(socket.server.rows.map((r) => r.text)).toEqual(texts);
    hook.unmount();
  });
});
