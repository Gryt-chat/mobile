import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which servers this device has been a guest on. Not a secret — the seed
 * reproduces every guest key that could exist, and this is which were used.
 *
 * **It has to be local, because the server cannot be asked without telling it
 * the answer.** Proving a prior guest identity is the disclosure, and declining
 * afterwards cannot take it back (GRYT-285).
 *
 * Each scope carries when it was last used, so the prompt asking whether to
 * convert a guest user has something to show. That date is this device's and
 * never the server's, for the reason above.
 */

const KEY = "guestHistory";

/** What this device knows about one guest membership. */
export interface GuestVisit {
  /**
   * Epoch ms of the last guest join for this scope, or null for an entry
   * written before this field existed.
   */
  lastUsed: number | null;
}

/** Scopes, not addresses. See `identityScopeFor`. */
export function parseScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/**
 * Reads both shapes. This was a bare array of scope strings until the date was
 * added, and those entries stay valid with no date — somebody who upgrades
 * mid-membership still has to be offered the conversion on every server they
 * had already joined.
 */
export function parseHistory(raw: unknown): Map<string, GuestVisit> {
  if (Array.isArray(raw)) {
    return new Map(parseScopes(raw).map((scope) => [scope, { lastUsed: null }]));
  }
  if (!raw || typeof raw !== "object") return new Map();

  const out = new Map<string, GuestVisit>();
  for (const [scope, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!scope) continue;
    const lastUsed =
      value !== null &&
      typeof value === "object" &&
      typeof (value as Partial<GuestVisit>).lastUsed === "number"
        ? (value as GuestVisit).lastUsed
        : null;
    out.set(scope, { lastUsed });
  }
  return out;
}

async function read(): Promise<Map<string, GuestVisit>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? parseHistory(JSON.parse(raw)) : new Map();
  } catch {
    /* Unreadable or unparseable is the same as empty. The cost of being wrong
     * is that somebody is not offered a claim they could have made, and the
     * server menu still lets them ask for it by hand. Failing that way round is
     * the right one: the other direction offers to disclose something. */
    return new Map();
  }
}

export async function listGuestScopes(): Promise<string[]> {
  return [...(await read()).keys()];
}

export async function hasGuestScope(scope: string): Promise<boolean> {
  return (await read()).has(scope);
}

/** What is known about one scope, or null if this device has never used it. */
export async function getGuestVisit(scope: string): Promise<GuestVisit | null> {
  return (await read()).get(scope) ?? null;
}

/**
 * Note that this device has been a guest under `scope`, and when.
 *
 * Writes every call rather than returning early on a scope already known,
 * because the date is the point of it. The caller is the join, so this is the
 * last time the guest user actually connected.
 */
export async function rememberGuestScope(scope: string): Promise<void> {
  if (!scope) return;
  const history = await read();
  history.set(scope, { lastUsed: Date.now() });
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(history)));
  } catch {
    // Losing the record costs an offer, not a membership.
  }
}
