import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which servers this device joined *as the signed-in account* rather than as a
 * guest — signing out takes those with you, or somebody posts as the account
 * they thought they had left (GRYT-572).
 *
 * **Nothing else can tell them apart.** `JoinedServer` records what a server is
 * called, not who you were when you joined it, and the handshake is the only
 * moment the answer is known.
 */

const KEY = "account.servers";
const OWNER_KEY = "account.servers.owner";

/**
 * Whose memberships these are, as the Keycloak subject. **The answer has to
 * survive the account being signed out**, which is exactly when there is no
 * profile to ask — without it the only signal is "signed out", which fires for
 * an expiry as much as for a decision (GRYT-579).
 */
export async function readAccountOwner(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export async function writeAccountOwner(sub: string): Promise<void> {
  try {
    await AsyncStorage.setItem(OWNER_KEY, sub);
  } catch {
    /* Same trade as the list: the cost is a switch of accounts that leaves the
     * previous one's servers behind, not a membership destroyed. */
  }
}

async function read(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return new Set(parseHosts(raw ? JSON.parse(raw) : null));
  } catch {
    /* An unreadable list means "no account memberships known", which errs
     * towards keeping servers rather than dropping them. Losing one is a
     * membership; keeping one too many is a sign-out that needs finishing by
     * hand. */
    return new Set();
  }
}

/** Defensive, because this is JSON an older build may have written. */
export function parseHosts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((host): host is string => typeof host === "string" && host.length > 0);
}

async function write(hosts: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...hosts]));
  } catch {
    /* The cost is a server that outlives the sign-out that should have taken
     * it, which the person can leave by hand. Not worth failing a join over. */
  }
}

/** Called from the join, when the account certificate was the one presented. */
export async function rememberAccountServer(host: string): Promise<void> {
  if (!host) return;
  const hosts = await read();
  if (hosts.has(host)) return;
  hosts.add(host);
  await write(hosts);
}

/**
 * Called when a server is left, however it was left.
 *
 * Including by the sign-out below, so the list does not keep naming servers
 * that are no longer joined — a stale entry would silently drop a *guest*
 * membership made at the same address later.
 */
export async function forgetAccountServer(host: string): Promise<void> {
  const hosts = await read();
  if (!hosts.delete(host)) return;
  await write(hosts);
}

/** Every server joined with the account, for the sign-out to leave. */
export async function listAccountServers(): Promise<string[]> {
  return [...(await read())];
}

/** Everything, for when the account itself goes away. */
export async function clearAccountServers(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEY, OWNER_KEY]);
  } catch {
    // Same trade as `write`.
  }
}
