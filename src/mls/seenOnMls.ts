import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Decision 4's record: people seen on MLS, per server, never sealed to with version 1 again.
 * A peer pin has no field for it yet, so it sits next to the pins.
 */

const KEY_PREFIX = "mlsSeenOnMls:";

export interface SeenOnMls {
  has(serverUserId: string): Promise<boolean>;
  add(serverUserId: string): Promise<void>;
}

const cache = new Map<string, Promise<Set<string>>>();

function load(scope: string): Promise<Set<string>> {
  let loaded = cache.get(scope);
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY_PREFIX + scope)
      .then((raw) => new Set<string>(raw ? (JSON.parse(raw) as string[]) : []))
      // Unreadable reads as nobody seen, and the next MLS message records them again.
      .catch(() => new Set<string>());
    cache.set(scope, loaded);
  }
  return loaded;
}

export function seenOnMlsFor(scope: string): SeenOnMls {
  return {
    has: async (id) => (await load(scope)).has(id),
    async add(id) {
      const seen = await load(scope);
      if (seen.has(id)) return;
      seen.add(id);
      await AsyncStorage.setItem(KEY_PREFIX + scope, JSON.stringify([...seen])).catch(() => undefined);
    },
  };
}

/** For tests. */
export function resetSeenOnMls(): void {
  cache.clear();
}
