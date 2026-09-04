import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which servers this device has been a guest on. Not a secret, and deliberately
 * not in the Keychain — the seed reproduces every guest key that could exist,
 * and this is the separate question of which were ever used somewhere.
 *
 * **It has to be local, because the server cannot be asked without telling it
 * the answer.** Proving a prior guest identity means signing a link with that
 * guest key, and once the proof arrives the account and the guest are the same
 * person; declining afterwards cannot take that back. Per-server unlinkability
 * is what the whole guest design protects.
 *
 * The desktop's `guest-history.ts` is the same file with `localStorage` where
 * this has AsyncStorage (GRYT-285).
 */

const KEY = "guestHistory";

/** Scopes, not addresses. See `identityScopeFor`. */
export function parseScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
}

async function read(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return new Set(raw ? parseScopes(JSON.parse(raw)) : []);
  } catch {
    /* Unreadable or unparseable is the same as empty. The cost of being wrong
     * is that somebody is not offered a claim they could have made, and the
     * server menu still lets them ask for it by hand. Failing that way round is
     * the right one: the other direction offers to disclose something. */
    return new Set();
  }
}

export async function listGuestScopes(): Promise<string[]> {
  return [...(await read())];
}

export async function hasGuestScope(scope: string): Promise<boolean> {
  return (await read()).has(scope);
}

export async function rememberGuestScope(scope: string): Promise<void> {
  if (!scope) return;
  const scopes = await read();
  if (scopes.has(scope)) return;
  scopes.add(scope);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...scopes]));
  } catch {
    // Losing the record costs an offer, not a membership.
  }
}
