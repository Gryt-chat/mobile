import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

import type { DirectConversation } from "./directMessages";

/**
 * Conversations taken out of this device's Messages list. Per device and per
 * account, and never sent anywhere: the server let go of this in GRYT-1379.
 */

const STORAGE_PREFIX = "gryt:hiddenConversations";

/** Conversation id to the moment it was hidden, in epoch milliseconds. */
export type HiddenAt = Readonly<Record<string, number>>;

const EMPTY: HiddenAt = Object.freeze({});

function storageKey(host: string, serverUserId: string): string {
  return `${STORAGE_PREFIX}:${host}:${serverUserId}`;
}

function accountKey(host: string, serverUserId: string): string {
  return JSON.stringify([host, serverUserId]);
}

function parseHidden(raw: string | null): HiddenAt {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
    }
    return Object.freeze(out);
  } catch {
    return EMPTY;
  }
}

/* Loaded lazily and kept here rather than in React state, so a screen mounted
   twice for the same account shares one read of storage. */
let byAccount: ReadonlyMap<string, HiddenAt> = new Map();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

/** Reads storage once per account, keeping every later call synchronous. */
async function load(host: string, serverUserId: string): Promise<void> {
  const key = accountKey(host, serverUserId);
  if (byAccount.has(key) || loading.has(key)) return;
  loading.add(key);
  try {
    const raw = await AsyncStorage.getItem(storageKey(host, serverUserId));
    const next = new Map(byAccount);
    next.set(key, parseHidden(raw));
    byAccount = next;
  } catch {
    // Unreadable storage means nothing hidden, which draws every conversation —
    // the safe way to be wrong.
    const next = new Map(byAccount);
    next.set(key, EMPTY);
    byAccount = next;
  } finally {
    loading.delete(key);
    emitChange();
  }
}

function writeStorage(host: string, serverUserId: string, hidden: HiddenAt): void {
  const write =
    Object.keys(hidden).length === 0
      ? AsyncStorage.removeItem(storageKey(host, serverUserId))
      : AsyncStorage.setItem(storageKey(host, serverUserId), JSON.stringify(hidden));
  write.catch(() => {
    // Held in memory for this run. The next launch starts from whatever did save.
  });
}

function store(host: string, serverUserId: string, hidden: HiddenAt): void {
  const next = new Map(byAccount);
  next.set(accountKey(host, serverUserId), hidden);
  byAccount = next;
  writeStorage(host, serverUserId, hidden);
  emitChange();
}

/** Takes a conversation out of the list. `at` is only ever passed by a test. */
export function hideConversation(
  host: string,
  serverUserId: string,
  conversationId: string,
  at: number = Date.now(),
): void {
  const held = byAccount.get(accountKey(host, serverUserId)) ?? EMPTY;
  if (held[conversationId] === at) return;
  store(host, serverUserId, Object.freeze({ ...held, [conversationId]: at }));
}

/** Puts it back, by hand or because a message brought it back. */
export function showConversation(host: string, serverUserId: string, conversationId: string): void {
  const held = byAccount.get(accountKey(host, serverUserId)) ?? EMPTY;
  if (!(conversationId in held)) return;
  const next = { ...held };
  delete next[conversationId];
  store(host, serverUserId, Object.freeze(next));
}

/**
 * Whether a message landed after it was hidden, read off the list the server
 * already sends. Clamped to now, or a clock that went back hides it for good.
 */
export function isBackFromHiding(
  hiddenAt: number,
  lastMessageAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastMessageAt) return false;
  const wrote = Date.parse(lastMessageAt);
  if (Number.isNaN(wrote)) return false;
  return wrote > Math.min(hiddenAt, now);
}

export interface SplitConversations {
  /** The rows the list draws, in the order they came in. */
  listed: DirectConversation[];
  /** The rows under the Hidden group, same order. */
  hidden: DirectConversation[];
  /** Hidden ones a message brought back. Their stored entries can go. */
  returned: DirectConversation[];
}

/**
 * Splits what the server sent into the two lists. Pure, so the ones that came
 * back are forgotten in an effect rather than during a render.
 */
export function splitHidden(
  conversations: readonly DirectConversation[],
  hiddenAt: HiddenAt,
  now: number = Date.now(),
): SplitConversations {
  const listed: DirectConversation[] = [];
  const hidden: DirectConversation[] = [];
  const returned: DirectConversation[] = [];

  for (const conversation of conversations) {
    const at = hiddenAt[conversation.conversation_id];
    if (at === undefined) {
      listed.push(conversation);
      continue;
    }
    if (isBackFromHiding(at, conversation.last_message_at)) {
      listed.push(conversation);
      returned.push(conversation);
      continue;
    }
    hidden.push(conversation);
  }

  return { listed, hidden, returned };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlyMap<string, HiddenAt> {
  return byAccount;
}

/**
 * What this account has hidden on this server, following every change. Starts
 * empty and fills in once storage answers, so nothing needs a loading state.
 */
export function useHiddenConversations(host: string | null, serverUserId: string | null): HiddenAt {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (host && serverUserId) void load(host, serverUserId);
  }, [host, serverUserId]);

  if (!host || !serverUserId) return EMPTY;
  return snapshot.get(accountKey(host, serverUserId)) ?? EMPTY;
}

/** For a test, so one case cannot leak into the next. */
export function resetHiddenConversations(): void {
  byAccount = new Map();
  loading.clear();
  emitChange();
}
