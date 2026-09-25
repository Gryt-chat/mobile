import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { type ContactKnowledge, emptyKnowledge, type FilteredEvent } from "./contactFilter";

/**
 * What the contact guard knows per server, and what it has held back (GRYT-1470).
 * On this phone only, like the desktop's.
 */

const KNOWLEDGE_KEY = "gryt:contactKnowledge";
const FILTERED_KEY = "gryt:contactFiltered";
const MAX_IDS = 2000;
const MAX_FILTERED = 100;

type StoredKnowledge = Record<string, { friends?: string[]; known?: string[]; baselined?: boolean }>;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

let saved: StoredKnowledge = {};
const knowledge = new Map<string, ContactKnowledge>();

function fill(k: ContactKnowledge, from: StoredKnowledge[string] | undefined): void {
  for (const id of strings(from?.friends)) k.friends.add(id);
  for (const id of strings(from?.known)) k.known.add(id);
  if (from?.baselined === true) k.baselined = true;
}

/** One object per server for the life of the app, so the guard and the disk agree. */
export function knowledgeFor(host: string): ContactKnowledge {
  let k = knowledge.get(host);
  if (k) return k;
  k = emptyKnowledge();
  fill(k, saved[host]);
  knowledge.set(host, k);
  return k;
}

export function persistKnowledge(host: string): void {
  const k = knowledge.get(host);
  if (!k) return;
  saved = {
    ...saved,
    [host]: { friends: [...k.friends].slice(-MAX_IDS), known: [...k.known].slice(-MAX_IDS), baselined: k.baselined },
  };
  void AsyncStorage.setItem(KNOWLEDGE_KEY, JSON.stringify(saved)).catch(() => {});
}

/** You opened something that was held back, so the guard lets that conversation in. */
export function admitConversation(host: string, conversationId: string): void {
  knowledgeFor(host).known.add(conversationId);
  persistKnowledge(host);
}

/** One row per conversation, and one per conversation that rang. */
export interface FilteredItem {
  host: string;
  conversationId: string;
  kind: FilteredEvent["kind"];
  reason: FilteredEvent["reason"];
  fromId: string | null;
  fromName: string | null;
  count: number;
  lastAt: number;
}

let filtered: FilteredItem[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/* Read once at start; a server connecting before it lands merges into what was read. */
export const contactFilterLoaded: Promise<void> = Promise.all([
  AsyncStorage.getItem(KNOWLEDGE_KEY),
  AsyncStorage.getItem(FILTERED_KEY),
])
  .then(([rawKnowledge, rawFiltered]) => {
    saved = rawKnowledge ? (JSON.parse(rawKnowledge) as StoredKnowledge) : {};
    for (const [host, k] of knowledge) fill(k, saved[host]);
    const list: unknown = rawFiltered ? JSON.parse(rawFiltered) : [];
    if (Array.isArray(list)) {
      filtered = [...filtered, ...list.filter((f) => f && typeof f.host === "string" && typeof f.count === "number")].slice(0, MAX_FILTERED);
      emit();
    }
  })
  .catch(() => {});

function commit(next: FilteredItem[]): void {
  filtered = next;
  emit();
  void AsyncStorage.setItem(FILTERED_KEY, JSON.stringify(filtered)).catch(() => {});
}

function rowKind(kind: FilteredEvent["kind"]): "call" | "message" {
  return kind === "call" ? "call" : "message";
}

export function recordFiltered(event: FilteredEvent): void {
  const same = (f: FilteredItem) =>
    f.host === event.host && f.conversationId === event.conversationId && rowKind(f.kind) === rowKind(event.kind);
  const prev = filtered.find(same);
  // The conversation arriving adds no message to the count; its first message does.
  const opened = event.kind === "conversation";
  const kind = opened ? (prev?.kind ?? "conversation") : event.kind;
  const count = opened ? (prev?.count ?? 1) : prev?.kind === "conversation" ? 1 : (prev?.count ?? 0) + 1;
  commit([
    {
      host: event.host,
      conversationId: event.conversationId,
      kind,
      reason: event.reason,
      fromId: event.fromId ?? prev?.fromId ?? null,
      fromName: event.fromName ?? prev?.fromName ?? null,
      count,
      lastAt: event.at,
    },
    ...filtered.filter((f) => !same(f)),
  ].slice(0, MAX_FILTERED));
}

export function dismissFiltered(host: string, conversationId: string): void {
  commit(filtered.filter((f) => !(f.host === host && f.conversationId === conversationId)));
}

export function clearFiltered(host: string): void {
  commit(filtered.filter((f) => f.host !== host));
}

/** What they did, in a few words. */
export function filteredSummary(item: FilteredItem): string {
  const times = item.count === 1 ? "" : ` ${item.count} times`;
  const what =
    item.kind === "call" ? `Called you${times}`
      : item.kind === "conversation" ? "Started a conversation"
        : item.count === 1 ? "Sent a message" : `Sent ${item.count} messages`;
  return item.reason === "flood" ? `${what}, in a burst` : what;
}

export function getFiltered(): FilteredItem[] {
  return filtered;
}

export function useFilteredContacts(): FilteredItem[] {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, getFiltered);
}
