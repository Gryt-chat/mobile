import AsyncStorage from "@react-native-async-storage/async-storage";
import { PEER_PINS_KEY, type PeerPin, type PeerPinStore } from "@gryt/crypto";

/**
 * Where this app keeps the people it has pinned (GRYT-732).
 *
 * The deciding is in `@gryt/crypto`, which does not know what storage is — the
 * desktop has `localStorage` and this does not. What it asks for instead is a
 * `PeerPinStore` it can read and write without waiting, and this is that.
 *
 * ## Why it is synchronous over something that is not
 *
 * A member list is drawn from state. Making the pin lookup async would push a
 * promise into rendering every row, and the honest version of that is a second
 * render pass where every peer briefly reads as unpinned — which is the same
 * thing on screen as a peer whose key just changed.
 *
 * So the map is held in memory and `AsyncStorage` is where it is kept between
 * runs. `hydratePeerPins()` fills it once at startup; writes go to memory
 * immediately and to storage on their own. The window where a write has landed
 * in memory and not on disk is a process death away from losing one pin, which
 * costs one peer their trust-on-first-use and nothing else.
 *
 * ## Before hydration finishes
 *
 * Reads return an empty map, which makes every peer look unpinned and reads as
 * `first`. That is the one dangerous answer in this whole design — pinning a
 * substituted key is exactly what pinning exists to stop — so nothing may pin
 * on a decision taken before `hydratePeerPins()` has resolved. The socket layer
 * awaits it before the first member list is evaluated, and `peerPinsReady()` is
 * how anything else can.
 *
 * Not in the Keychain, for the reason `pins.ts` gives: none of this is secret.
 * It is public keys, and what matters is that nothing but this app can change
 * them, which app-private storage already gives.
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
