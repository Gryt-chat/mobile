import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * How loud each person is, for you alone. Keyed by server user id like the desktop's
 * `userVolumes`, in percent from 0 to 200, and a local mute the desktop doesn't have.
 */

export const VOLUME_MIN = 0;
export const VOLUME_MAX = 200;
export const VOLUME_STEP = 1;
export const VOLUME_DEFAULT = 100;

export interface UserAudio {
  /** Only the ones moved off 100, as on the desktop. */
  volumes: Record<string, number>;
  /** Separate from the volume, so unmuting brings back what the slider said. */
  muted: Record<string, true>;
}

const KEY = "gryt:userVolumes";

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return VOLUME_DEFAULT;
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Math.round(value / VOLUME_STEP) * VOLUME_STEP));
}

export function parseUserAudio(raw: unknown): UserAudio {
  const out: UserAudio = { volumes: {}, muted: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const outer = raw as Record<string, unknown>;
  const volumes = outer.volumes;
  if (volumes && typeof volumes === "object" && !Array.isArray(volumes)) {
    for (const [id, value] of Object.entries(volumes as Record<string, unknown>)) {
      if (id && typeof value === "number" && Number.isFinite(value)) out.volumes[id] = clampVolume(value);
    }
  }
  const muted = outer.muted;
  if (muted && typeof muted === "object" && !Array.isArray(muted)) {
    for (const [id, value] of Object.entries(muted as Record<string, unknown>)) {
      if (id && value === true) out.muted[id] = true;
    }
  }
  return out;
}

export function volumeOf(audio: UserAudio, serverUserId: string): number {
  return audio.volumes[serverUserId] ?? VOLUME_DEFAULT;
}

export function isLocallyMuted(audio: UserAudio, serverUserId: string): boolean {
  return audio.muted[serverUserId] === true;
}

/** What goes to the track: the desktop's `volume / 100`, and nothing at all when muted. */
export function gainOf(audio: UserAudio, serverUserId: string | null | undefined): number {
  if (!serverUserId) return 1;
  if (isLocallyMuted(audio, serverUserId)) return 0;
  return volumeOf(audio, serverUserId) / 100;
}

export function withVolume(audio: UserAudio, serverUserId: string, volume: number): UserAudio {
  return { ...audio, volumes: { ...audio.volumes, [serverUserId]: clampVolume(volume) } };
}

/** Deletes the entry rather than writing 100, the way the desktop's reset does. */
export function withoutVolume(audio: UserAudio, serverUserId: string): UserAudio {
  const volumes = { ...audio.volumes };
  delete volumes[serverUserId];
  return { ...audio, volumes };
}

export function withMuted(audio: UserAudio, serverUserId: string, muted: boolean): UserAudio {
  const next = { ...audio.muted };
  if (muted) next[serverUserId] = true;
  else delete next[serverUserId];
  return { ...audio, muted: next };
}

let stored: UserAudio = parseUserAudio(null);
const listeners = new Set<() => void>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export const userVolumesLoaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    stored = parseUserAudio(raw ? JSON.parse(raw) : null);
    emit();
  })
  .catch(() => {});

/* A slider drag changes this every frame, so the disk hears about it once it settles. */
function commit(next: UserAudio): void {
  stored = next;
  emit();
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void AsyncStorage.setItem(KEY, JSON.stringify(stored)).catch(() => {
      // Holds for this session.
    });
  }, 300);
}

export function getUserAudio(): UserAudio {
  return stored;
}

export function setUserVolume(serverUserId: string, volume: number): void {
  commit(withVolume(stored, serverUserId, volume));
}

export function resetUserVolume(serverUserId: string): void {
  commit(withoutVolume(stored, serverUserId));
}

export function setUserMuted(serverUserId: string, muted: boolean): void {
  commit(withMuted(stored, serverUserId, muted));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUserAudio(): UserAudio {
  return useSyncExternalStore(subscribe, getUserAudio, getUserAudio);
}
