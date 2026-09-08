import AsyncStorage from "@react-native-async-storage/async-storage";
import { PEER_PINS_KEY, type PeerPin, type PeerPinStore } from "@gryt/crypto";

/**
 * Where this app keeps the people it has pinned. Synchronous over storage that is not: an
 * async lookup reads every peer as unpinned until `hydratePeerPins()` resolves (GRYT-732).
 */

let pins: Record<string, PeerPin> = {};
let hydrated = false;
let hydrating: Promise<void> | null = null;

/**
 * Read the pins off disk, once. Repeated calls return the same promise: a second read
 * racing a write would put a stale map back.
 */
export function hydratePeerPins(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;

  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(PEER_PINS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") pins = parsed;
    } catch {
      // Unreadable storage is not the same as no pins, and there is no better answer
      // from in here. `server-pins.ts` has taken the same trade since GRYT-51.
    }
    hydrated = true;
    hydrating = null;
  })();

  return hydrating;
}

/** Whether a read would answer from disk rather than from nothing. */
export function peerPinsReady(): boolean {
  return hydrated;
}

let flushing: Promise<void> | null = null;
let pendingFlush = false;

/**
 * One write at a time, and one more queued at most. Without this they interleave and
 * the last to *finish* wins, which is not the last asked for.
 */
function flush(): void {
  if (flushing) {
    pendingFlush = true;
    return;
  }

  flushing = (async () => {
    try {
      await AsyncStorage.setItem(PEER_PINS_KEY, JSON.stringify(pins));
    } catch {
      // Full or blocked. The decision has already been made and returned; this
      // loses the memory of it rather than the answer.
    }
    flushing = null;
    if (pendingFlush) {
      pendingFlush = false;
      flush();
    }
  })();
}

export const peerPinStore: PeerPinStore = {
  read() {
    return pins;
  },
  write(next) {
    pins = next;
    flush();
  },
};

/** For tests, and for signing out. */
export function resetPeerPins(): void {
  pins = {};
  hydrated = false;
  hydrating = null;
}
