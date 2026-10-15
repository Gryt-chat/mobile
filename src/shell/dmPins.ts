import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * Conversations pinned to the top of the Messages tab, in the order they were pinned.
 * On this phone only; the server never hears of it (GRYT-1747).
 */

const KEY = "gryt:pinnedConversations";

let pins: readonly string[] = [];
const listeners = new Set<() => void>();

const key = (host: string, conversationId: string) => `${host}/${conversationId}`;

void AsyncStorage.getItem(KEY)
  .then((raw) => {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      pins = parsed.filter((p): p is string => typeof p === "string");
      for (const listener of listeners) listener();
    }
  })
  .catch(() => {
    // Nothing pinned, which is safe to be wrong about.
  });

export function setPinned(host: string, conversationId: string, pinned: boolean): void {
  const k = key(host, conversationId);
  pins = pinned ? [...pins.filter((p) => p !== k), k] : pins.filter((p) => p !== k);
  for (const listener of listeners) listener();
  void AsyncStorage.setItem(KEY, JSON.stringify(pins)).catch(() => {});
}

/** Where a conversation sits among the pins, or -1. */
export function pinIndex(all: readonly string[], host: string, conversationId: string): number {
  return all.indexOf(key(host, conversationId));
}

export function usePins(): readonly string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pins,
    () => pins,
  );
}
