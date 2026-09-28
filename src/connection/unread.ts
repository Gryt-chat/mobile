import { useSyncExternalStore } from "react";

import { markServerThreadsRead, markThreadsReadIn } from "../threads/threadUnread";

/**
 * Messages nobody has read, per server and conversation. **Counted from when this
 * phone connected**, like the desktop's useUnreadTracker: the server keeps no marker.
 */
export type UnreadCounts = Record<string, Record<string, number>>;

export function bump(all: UnreadCounts, host: string, conversationId: string): UnreadCounts {
  const counts = all[host] ?? {};
  return { ...all, [host]: { ...counts, [conversationId]: (counts[conversationId] ?? 0) + 1 } };
}

export function clearConversation(all: UnreadCounts, host: string, conversationId: string): UnreadCounts {
  const counts = all[host];
  if (!counts || !(conversationId in counts)) return all;
  const next = { ...counts };
  delete next[conversationId];
  return clearServer({ ...all, [host]: next }, host, Object.keys(next).length === 0);
}

export function clearServer(all: UnreadCounts, host: string, when = true): UnreadCounts {
  if (!when || !(host in all)) return all;
  const next = { ...all };
  delete next[host];
  return next;
}

/** Everything waiting on one server, for its tile in the switcher. */
export function serverTotal(all: UnreadCounts, host: string): number {
  let total = 0;
  for (const n of Object.values(all[host] ?? {})) total += n;
  return total;
}

/**
 * Where the first unread message sits in a newest-first list: the `count`th newest one
 * somebody else wrote. Null when the list does not reach back that far yet.
 */
export function firstUnreadIndex(
  newestFirst: readonly { sender_server_id: string; pending?: boolean; system?: boolean }[],
  count: number,
  me: string | null,
): number | null {
  if (count <= 0) return null;
  let seen = 0;
  for (let i = 0; i < newestFirst.length; i++) {
    const m = newestFirst[i];
    if (m.pending || m.system || (me !== null && m.sender_server_id === me)) continue;
    seen++;
    if (seen === count) return i;
  }
  return null;
}

/* The store. Module level, as on the desktop, so a count kept for a screen not
   mounted survives, and mark as read can reach it from a menu. */
let unread: UnreadCounts = {};
let open: { host: string; conversationId: string } | null = null;
const listeners = new Set<() => void>();

function set(next: UnreadCounts) {
  if (next === unread) return;
  unread = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One more, unless it landed in the conversation on screen. */
export function markUnread(host: string, conversationId: string) {
  if (open && open.host === host && open.conversationId === conversationId) return;
  set(bump(unread, host, conversationId));
}

export function markConversationRead(host: string, conversationId: string) {
  set(clearConversation(unread, host, conversationId));
}

export function markServerRead(host: string) {
  set(clearServer(unread, host));
}

/**
 * The conversation on screen, which counts nothing while it is. Hands back what was
 * waiting there, which opening it reads.
 */
export function openConversation(host: string, conversationId: string): number {
  const waiting = unread[host]?.[conversationId] ?? 0;
  open = { host, conversationId };
  markConversationRead(host, conversationId);
  return waiting;
}

/** Only if it is still the one open: a screen losing focus to another sets its own. */
export function closeConversation(host: string, conversationId: string) {
  if (open?.host === host && open.conversationId === conversationId) open = null;
}

export function useUnread(): UnreadCounts {
  return useSyncExternalStore(subscribe, () => unread, () => unread);
}

/** The slice of a socket this needs, so a test can hand in a stand-in. */
interface Emitter {
  emit: (event: string, payload: unknown) => void;
}

/**
 * Done with a channel or DM: the count here, and every mention in it on the server,
 * threads and all. The server answers with the mention counts, which clears those.
 */
export function readConversation(socket: Emitter | null | undefined, host: string, conversationId: string) {
  markConversationRead(host, conversationId);
  markThreadsReadIn(host, conversationId);
  socket?.emit("mentions:seen", { conversationId, includeThreads: true });
}

/** Done with a whole server. No conversation is all of them, which the server has always read that way. */
export function readServer(socket: Emitter | null | undefined, host: string) {
  markServerRead(host);
  markServerThreadsRead(host);
  socket?.emit("mentions:seen", {});
}
