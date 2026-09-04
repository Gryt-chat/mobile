import AsyncStorage from "@react-native-async-storage/async-storage";
import { PEER_PINS_KEY, type PeerPin, type PeerPinStore } from "@gryt/crypto";

/**
 * Where this app keeps the people it has pinned (GRYT-732). `@gryt/crypto` asks
 * for a `PeerPinStore` it can read and write without waiting, and this is that.
 *
 * **Synchronous, over storage that is not.** An async pin lookup pushes a
 * promise into rendering every row, and the honest version is a second render
 * pass where every peer briefly reads as unpinned — which looks exactly like a
 * peer whose key just changed. So the map is in memory and AsyncStorage keeps
 * it between runs.
 *
 * **Nothing may pin on a decision taken before `hydratePeerPins()` resolves.**
 * Reads before that return an empty map, so every peer reads as `first`, and
 * pinning a substituted key is what pinning exists to stop. The socket layer
 * awaits it before the first member list; `peerPinsReady()` is how anything
 * else can.
 *
 * Not in the Keychain: these are public keys, and what matters is that nothing
 * but this app can change them.
 */

let pins: Record<string, PeerPin> = {};
let hydrated = false;
let hydrating: Promise<void> | null = null;

/**
 * Read the pins off disk, once.
 *
 * Repeated calls return the same promise rather than reading again — several
 * screens can ask, and a second read racing a write would put a stale map back.
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
      // Unreadable storage is not the same as no pins, and there is no better
      // answer available from in here. `server-pins.ts` on the desktop has
      // taken the same trade since GRYT-51.
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
 * One write at a time, and one more queued at most.
 *
 * A member list can pin several people in a row, and each write serialises the
 * whole map. Without this they interleave and the last one to *finish* wins,
 * which is not the last one to be asked for.
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
