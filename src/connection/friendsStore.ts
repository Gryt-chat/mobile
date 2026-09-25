import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import type { FriendGate } from "./contactFilter";
import {
  confirmFriend,
  emptyBook,
  type FriendBook,
  type FriendState,
  friendState,
  type ServerFriendList,
  type ServerFriendPerson,
  unconfirmed,
} from "./friendList";

/**
 * Your friends per server (GRYT-1471). The book is this phone's own, in AsyncStorage
 * and nowhere else, like the desktop's. The server's list is held for the session.
 */

const BOOK_KEY = "gryt:friends";
/* A request is announced once per phone, however often the server says it again. */
const MAX_NOTIFIED = 500;

type StoredBook = Record<string, { friends?: Record<string, { nickname?: unknown; since?: unknown }>; asked?: Record<string, unknown>; notified?: unknown }>;

let saved: StoredBook = {};
const books = new Map<string, FriendBook>();
const notified = new Map<string, Set<string>>();
const lists = new Map<string, ServerFriendList>();
const emitters = new Map<string, (event: string, serverUserId: string) => void>();
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function fill(host: string, book: FriendBook): void {
  const from = saved[host];
  for (const [id, e] of Object.entries(from?.friends ?? {})) {
    if (!book.friends.has(id)) {
      book.friends.set(id, { nickname: typeof e?.nickname === "string" ? e.nickname : null, since: Number(e?.since) || 0 });
    }
  }
  for (const [id, at] of Object.entries(from?.asked ?? {})) if (!book.asked.has(id)) book.asked.set(id, Number(at) || 0);
  const seen = notified.get(host) ?? new Set<string>();
  if (Array.isArray(from?.notified)) for (const id of from.notified) if (typeof id === "string") seen.add(id);
  notified.set(host, seen);
}

/* Read once at start. The handshake waits on it, so no list lands before the book. */
export const friendsLoaded: Promise<void> = AsyncStorage.getItem(BOOK_KEY)
  .then((raw) => {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    saved = parsed && typeof parsed === "object" ? (parsed as StoredBook) : {};
    for (const [host, book] of books) fill(host, book);
    changed();
  })
  .catch(() => {});

export function friendBookFor(host: string): FriendBook {
  let book = books.get(host);
  if (book) return book;
  book = emptyBook();
  fill(host, book);
  books.set(host, book);
  return book;
}

export function persistFriendBook(host: string): void {
  const book = friendBookFor(host);
  saved = {
    ...saved,
    [host]: {
      friends: Object.fromEntries([...book.friends].map(([id, e]) => [id, { nickname: e.nickname, since: e.since }])),
      asked: Object.fromEntries(book.asked),
      notified: [...(notified.get(host) ?? [])].slice(-MAX_NOTIFIED),
    },
  };
  void AsyncStorage.setItem(BOOK_KEY, JSON.stringify(saved)).catch(() => {});
  changed();
}

/** What the contact guard asks, straight from the book. */
export function friendGateFor(host: string): FriendGate {
  return {
    isFriend: (id) => friendBookFor(host).friends.has(id),
    hasAny: () => friendBookFor(host).friends.size > 0,
  };
}

export function setServerFriendList(host: string, list: ServerFriendList): void {
  lists.set(host, list);
  changed();
}

export function forgetServerFriendList(host: string): void {
  if (lists.delete(host)) changed();
}

/** True the first time this phone hears about a request from them. */
export function firstNoticeOf(host: string, serverUserId: string): boolean {
  friendBookFor(host);
  const seen = notified.get(host)!;
  if (seen.has(serverUserId)) return false;
  seen.add(serverUserId);
  persistFriendBook(host);
  return true;
}

export function registerFriendEmitter(host: string, emit: ((event: string, serverUserId: string) => void) | null): void {
  if (emit) emitters.set(host, emit);
  else emitters.delete(host);
}

export type FriendAction = "request" | "accept" | "decline" | "cancel" | "remove";

export function friendAction(host: string, action: FriendAction, serverUserId: string): void {
  emitters.get(host)?.(`friend:${action}`, serverUserId);
}

export function confirmServerFriend(host: string, person: ServerFriendPerson): void {
  confirmFriend(friendBookFor(host), person);
  persistFriendBook(host);
}

export interface HostFriends {
  host: string;
  friends: (ServerFriendPerson & { confirmed: boolean })[];
  incoming: ServerFriendPerson[];
  outgoing: ServerFriendPerson[];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => version;

export function friendsOf(host: string | null | undefined): HostFriends | null {
  const list = host ? lists.get(host) : undefined;
  if (!host || !list) return null;
  const pending = new Set(unconfirmed(friendBookFor(host), list).map((p) => p.serverUserId));
  return {
    host,
    friends: list.friends.map((p) => ({ ...p, confirmed: !pending.has(p.serverUserId) })),
    incoming: list.incoming,
    outgoing: list.outgoing,
  };
}

/** One server's friends, or null for a server from before GRYT-1471, which never answers. */
export function useFriends(host: string | null | undefined): HostFriends | null {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return friendsOf(host);
}

/** Where you stand with one person, or null when the server has no friends at all. */
export function friendStateOf(host: string | null | undefined, serverUserId: string | null | undefined): FriendState | null {
  if (!host || !serverUserId || !lists.has(host)) return null;
  return friendState(friendBookFor(host), lists.get(host) ?? null, serverUserId);
}

export function useFriendState(host: string | null | undefined, serverUserId: string | null | undefined): FriendState | null {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return friendStateOf(host, serverUserId);
}
