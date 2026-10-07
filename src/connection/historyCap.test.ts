import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Scrolling up keeps at most HISTORY_CAP messages, and Jump to present is one page away
 * (GRYT-1691). The real hook, against a server holding 760 messages.
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

import { HISTORY_CAP, useMessages } from "./useMessages";

type Listener = (...args: unknown[]) => void;

const TOTAL = 760;
const PAGE = 50;
const rows = Array.from({ length: TOTAL }, (_, i) => ({
  conversation_id: "general",
  message_id: `m-${String(i).padStart(4, "0")}`,
  sender_server_id: "them",
  text: `message ${i}`,
  created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
  reactions: null,
  attachments: null,
  reply_to_message_id: null,
}));

/** Pages like the server: newest first page, `before` and `after` cursors, newest at the end. */
class FakeSocket {
  connected = true;
  fetches: Record<string, unknown>[] = [];
  private listeners = new Map<string, Listener[]>();
  emit(event: string, payload: Record<string, unknown> = {}) {
    if (event === "chat:fetch") {
      this.fetches.push(payload);
      queueMicrotask(() => this.answer(payload));
    }
    return this;
  }
  private answer(p: Record<string, unknown>) {
    const at = (iso: unknown) => Date.parse(String(iso));
    let items: typeof rows;
    const reply: Record<string, unknown> = { conversation_id: "general" };
    if (p.before) {
      const older = rows.filter((r) => at(r.created_at) < at(p.before));
      items = older.slice(-PAGE);
      reply.before = p.before;
      reply.hasMore = older.length > PAGE;
    } else if (p.after) {
      const newer = rows.filter((r) => at(r.created_at) > at(p.after));
      items = newer.slice(0, PAGE);
      reply.after = p.after;
      reply.hasNewer = newer.length > PAGE;
    } else {
      items = rows.slice(-PAGE);
      reply.hasMore = true;
    }
    reply.items = items;
    for (const cb of this.listeners.get("chat:history") ?? []) cb(reply);
  }
  on(event: string, cb: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), cb]);
    return this;
  }
  off(event: string, cb: Listener) {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== cb));
    return this;
  }
  io = { opts: { reconnection: true } };
}

describe("a long scroll up", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never holds more than the cap, and Jump to present is one fetch", async () => {
    const socket = new FakeSocket();
    const hook = react.mount(() =>
      useMessages(socket as unknown as Socket, "general", {
        getAccessToken: async () => "token",
        me: { serverUserId: "me", nickname: "Me" } as never,
      }),
    );
    const settle = () => vi.advanceTimersByTimeAsync(10);
    await settle();
    expect(hook.current().messages).toHaveLength(PAGE);

    const sizes: number[] = [];
    while (hook.current().hasMore) {
      hook.current().loadOlder();
      await settle();
      sizes.push(hook.current().messages.length);
    }
    expect(Math.max(...sizes)).toBe(HISTORY_CAP);
    expect(hook.current().detached).toBe(true);
    // The oldest message is there and the list is still the cap, ending well before the present.
    const held = hook.current().messages;
    expect(held[0].text).toBe("message 0");
    expect(held).toHaveLength(HISTORY_CAP);
    expect(new Set(held.map((m) => m.message_id)).size).toBe(HISTORY_CAP);

    const before = socket.fetches.length;
    hook.current().returnToPresent();
    await settle();
    expect(socket.fetches.length).toBe(before + 1);
    expect(socket.fetches.at(-1)).not.toHaveProperty("before");
    expect(hook.current().detached).toBe(false);
    expect(hook.current().messages.at(-1)?.text).toBe(`message ${TOTAL - 1}`);
  });

  it("scrolling back down from a window drops the oldest end and reaches the present", async () => {
    const socket = new FakeSocket();
    const hook = react.mount(() =>
      useMessages(socket as unknown as Socket, "general", {
        getAccessToken: async () => "token",
        me: { serverUserId: "me", nickname: "Me" } as never,
      }),
    );
    const settle = () => vi.advanceTimersByTimeAsync(10);
    await settle();
    while (hook.current().hasMore) {
      hook.current().loadOlder();
      await settle();
    }
    const sizes: number[] = [];
    while (hook.current().detached) {
      hook.current().loadNewer();
      await settle();
      sizes.push(hook.current().messages.length);
    }
    expect(Math.max(...sizes.slice(0, -1))).toBeLessThanOrEqual(HISTORY_CAP);
    expect(hook.current().messages.at(-1)?.text).toBe(`message ${TOTAL - 1}`);
    expect(hook.current().hasMore).toBe(true);
  });
});
