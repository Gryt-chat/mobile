import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which servers this device has been a guest on. Local because the server cannot be asked
 * without being told the answer; not a secret, since the seed reproduces every key.
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
 * Reads both shapes. This was a bare array of scope strings until the date was added,
 * and those entries stay valid with no date.
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
    /* Unreadable or unparseable is the same as empty: the cost is that somebody is not
     * offered a claim, and the other direction offers to disclose something. */
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
 * Note that this device has been a guest under `scope`, and when. Writes every call,
 * because the date is the point — the caller is the join.
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
