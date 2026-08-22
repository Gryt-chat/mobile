import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which servers this device has been a guest on.
 *
 * Not a secret, and deliberately not in the Keychain. The seed reproduces every
 * guest key that has ever existed; this is the separate question of which of
 * those keys was ever actually *used* somewhere, which derivation cannot answer
 * — it will happily produce a key for a server nobody has visited.
 *
 * ## Why it has to be local
 *
 * The alternative is asking the server, and the server cannot be asked without
 * telling it the answer. Proving a prior guest identity means signing a link
 * with that guest key, and the moment that proof arrives the server knows the
 * account and the guest are the same person. If the reply is "yes, there is
 * something to claim" and the person then says no thanks, the linkage has
 * already happened and cannot be taken back.
 *
 * Per-server unlinkability is the property the whole guest design exists to
 * protect, so the question of whether to prove anything has to be answerable
 * without proving anything. Knowing locally is what makes that possible: the
 * person is asked first, and the proof is signed only after they agree.
 *
 * Ported from the desktop's `guest-history.ts`, which is the same file with
 * `localStorage` where this has AsyncStorage. GRYT-285.
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
