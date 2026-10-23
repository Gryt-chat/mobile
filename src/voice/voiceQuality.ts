import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/** The native engine's voice bitrate in kbps, kept on this phone (GRYT-1854). The desktop's slider, same range. */
export const VOICE_QUALITY = { min: 96, max: 192, step: 16 };

const KEY = "gryt:voiceBitrateKbps";

let kbps = VOICE_QUALITY.max;
const listeners = new Set<() => void>();

const clamp = (value: number) =>
  Number.isFinite(value) ? Math.min(VOICE_QUALITY.max, Math.max(VOICE_QUALITY.min, Math.round(value))) : VOICE_QUALITY.max;

/** What AsyncStorage holds, or 192 for nothing or something unreadable. */
export const parseVoiceQuality = (raw: string | null): number => (raw === null ? VOICE_QUALITY.max : clamp(Number(raw)));

function set(next: number): void {
  if (next === kbps) return;
  kbps = next;
  for (const listener of listeners) listener();
}

export const voiceQualityLoaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => set(parseVoiceQuality(raw)))
  .catch(() => {});

export function getVoiceQuality(): number {
  return kbps;
}

export function setVoiceQuality(next: number): void {
  set(clamp(next));
  void AsyncStorage.setItem(KEY, JSON.stringify(kbps)).catch(() => {
    // Holds for this session.
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceQuality(): number {
  return useSyncExternalStore(subscribe, getVoiceQuality, getVoiceQuality);
}
