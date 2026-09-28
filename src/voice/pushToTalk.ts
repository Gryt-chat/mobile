import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { parsePushToTalk, type PushToTalk } from "./talkGate";

/**
 * Push to talk on the phone: a setting, kept on this phone, and whether the talk button is
 * held right now. The held half is never stored, so a restart always starts closed.
 */

const KEY = "gryt:pushToTalk";

let state: PushToTalk = { enabled: false, held: false };
const listeners = new Set<() => void>();

function set(next: PushToTalk): void {
  if (next.enabled === state.enabled && next.held === state.held) return;
  state = next;
  for (const listener of listeners) listener();
}

export const pushToTalkLoaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    set({ ...state, enabled: parsePushToTalk(raw ? JSON.parse(raw) : null) });
  })
  .catch(() => {});

export function getPushToTalk(): PushToTalk {
  return state;
}

export function setPushToTalkEnabled(enabled: boolean): void {
  set({ enabled, held: false });
  void AsyncStorage.setItem(KEY, JSON.stringify({ enabled })).catch(() => {
    // Holds for this session.
  });
}

/** Ignored while the setting is off, so a stray press can't leave the gate open for later. */
export function setTalkHeld(held: boolean): void {
  set({ ...state, held: state.enabled && held });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePushToTalk(): PushToTalk {
  return useSyncExternalStore(subscribe, getPushToTalk, getPushToTalk);
}
