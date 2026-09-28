import { useSyncExternalStore } from "react";

/**
 * Replies in a thread nobody has read, per server and thread, with the channel each
 * hangs off. Counted from connect, like the desktop's useThreadUnread.
 */
export type ThreadUnreadCounts = Record<string, Record<string, { conversationId: string; count: number }>>;

export function bumpThread(
  all: ThreadUnreadCounts,
  host: string,
  conversationId: string,
  threadId: string,
): ThreadUnreadCounts {
  const counts = all[host] ?? {};
  return {
    ...all,
    [host]: { ...counts, [threadId]: { conversationId, count: (counts[threadId]?.count ?? 0) + 1 } },
  };
}

/** Drops the threads that match, and the server with its last one. */
function without(
  all: ThreadUnreadCounts,
  host: string,
  drop: (threadId: string, conversationId: string) => boolean,
): ThreadUnreadCounts {
  const counts = all[host];
  if (!counts) return all;
  const kept = Object.fromEntries(Object.entries(counts).filter(([id, t]) => !drop(id, t.conversationId)));
  if (Object.keys(kept).length === Object.keys(counts).length) return all;
  const next = { ...all };
  if (Object.keys(kept).length === 0) delete next[host];
  else next[host] = kept;
  return next;
}

export function clearThread(all: ThreadUnreadCounts, host: string, threadId: string): ThreadUnreadCounts {
  return without(all, host, (id) => id === threadId);
}

/** Every thread hanging off one channel, for Mark as read on it. */
export function clearThreadsIn(all: ThreadUnreadCounts, host: string, conversationId: string): ThreadUnreadCounts {
  return without(all, host, (_, conversation) => conversation === conversationId);
}

export function clearServerThreads(all: ThreadUnreadCounts, host: string): ThreadUnreadCounts {
  return without(all, host, () => true);
}

/** Unread replies across the threads of one channel, or of a whole server. */
export function threadUnreadIn(all: ThreadUnreadCounts, host: string, conversationId?: string): number {
  let total = 0;
  for (const t of Object.values(all[host] ?? {})) {
    if (conversationId === undefined || t.conversationId === conversationId) total += t.count;
  }
  return total;
}

/**
 * Where an arriving message counts: on its thread, on its conversation, or nowhere. Your
 * own, a system line and anything in a muted channel count nowhere, thread replies included.
 */
export function unreadTarget(
  message: { sender_server_id: string; thread_id?: string | null },
  { mine, system, muted }: { mine: boolean; system: boolean; muted: boolean },
): { thread: string } | "conversation" | null {
  if (mine || system || muted) return null;
  return message.thread_id ? { thread: message.thread_id } : "conversation";
}

/* The store, module level like the conversation counts, so a menu can clear it. */
let unread: ThreadUnreadCounts = {};
let open: { host: string; threadId: string } | null = null;
const listeners = new Set<() => void>();

function set(next: ThreadUnreadCounts) {
  if (next === unread) return;
  unread = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One more reply, unless it landed in the thread on screen. */
export function markThreadUnread(host: string, conversationId: string, threadId: string) {
  if (open?.host === host && open.threadId === threadId) return;
  set(bumpThread(unread, host, conversationId, threadId));
}

/** The thread on screen: opening it reads it, and nothing counts while it's open. */
export function openThreadCount(host: string, threadId: string) {
  open = { host, threadId };
  set(clearThread(unread, host, threadId));
}

/** Only if it is still the one open. */
export function closeThreadCount(host: string, threadId: string) {
  if (open?.host === host && open.threadId === threadId) open = null;
}

export function markThreadsReadIn(host: string, conversationId: string) {
  set(clearThreadsIn(unread, host, conversationId));
}

export function markServerThreadsRead(host: string) {
  set(clearServerThreads(unread, host));
}

/** The store as it stands, for a test with no React to render into. */
export function threadUnreadSnapshot(): ThreadUnreadCounts {
  return unread;
}

export function useThreadUnread(): ThreadUnreadCounts {
  return useSyncExternalStore(subscribe, () => unread, () => unread);
}
