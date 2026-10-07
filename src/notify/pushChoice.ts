import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * Whether each server may wake this phone (GRYT-1689). Asked once per server, so a
 * server nobody said yes to never reaches the push relay at all.
 */

export type PushChoice = "yes" | "no";

const KEY = "gryt:pushChoice";

let choices: Record<string, PushChoice> = {};
const listeners = new Set<() => void>();

export function parseChoices(raw: string | null): Record<string, PushChoice> {
  try {
    const value = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    const out: Record<string, PushChoice> = {};
    for (const [host, choice] of Object.entries(value ?? {})) if (choice === "yes" || choice === "no") out[host] = choice;
    return out;
  } catch {
    return {};
  }
}

export const pushChoicesLoaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    choices = parseChoices(raw);
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function getPushChoice(host: string): PushChoice | undefined {
  return choices[host];
}

/** Null forgets the answer, so the server asks again next time. */
export function setPushChoice(host: string, choice: PushChoice | null): void {
  const next = { ...choices };
  if (choice) next[host] = choice;
  else delete next[host];
  choices = next;
  listeners.forEach((l) => l());
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePushChoice(host: string): PushChoice | undefined {
  return useSyncExternalStore(subscribe, () => choices[host]);
}
