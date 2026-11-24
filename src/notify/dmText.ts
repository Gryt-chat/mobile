import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

/* "Show message text" for DMs on this phone (GRYT-2275). Off: the phone gives servers no key to
   seal a line to, so DMs say "New direct message". On unless turned off. */

const KEY = "gryt:dmTextInNotifications";
let on = true;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    on = (await AsyncStorage.getItem(KEY)) !== "0";
    emit();
  } catch {
    // Unreadable keeps the default.
  }
}

export function setDmTextInNotifications(next: boolean): void {
  on = next;
  loaded = true;
  emit();
  void (next ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, "0")).catch(() => {});
}

export function useDmTextInNotifications(): boolean {
  useEffect(() => void load(), []);
  return useSyncExternalStore(subscribe, () => on);
}
