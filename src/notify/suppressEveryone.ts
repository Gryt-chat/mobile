import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

/* "Suppress @everyone and @here", per server and per device, like the desktop's.
   Role mentions and being named still come through. */

const PREFIX = "gryt:suppressEveryone:";
let byHost: ReadonlyMap<string, boolean> = new Map();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSuppressEveryone(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function load(host: string): Promise<void> {
  if (byHost.has(host) || loading.has(host)) return;
  loading.add(host);
  try {
    const on = (await AsyncStorage.getItem(PREFIX + host)) === "1";
    if (!byHost.has(host)) {
      byHost = new Map(byHost).set(host, on);
      emit();
    }
  } catch {
    // Unreadable is off, which lets @everyone through.
  } finally {
    loading.delete(host);
  }
}

export function getSuppressEveryone(host: string): boolean {
  if (!byHost.has(host)) void load(host);
  return byHost.get(host) ?? false;
}

export function setSuppressEveryone(host: string, on: boolean): void {
  byHost = new Map(byHost).set(host, on);
  emit();
  void (on ? AsyncStorage.setItem(PREFIX + host, "1") : AsyncStorage.removeItem(PREFIX + host)).catch(() => {
    // Holds for this session.
  });
}

export function useSuppressEveryone(host: string): boolean {
  useEffect(() => void load(host), [host]);
  return useSyncExternalStore(subscribeSuppressEveryone, () => getSuppressEveryone(host));
}
