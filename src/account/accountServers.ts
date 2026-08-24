import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which servers this device joined *as the signed-in account*, rather than as a
 * guest.
 *
 * A membership made with an account belongs to that account. Signing out should
 * therefore take it with you — you are not that person on that server any more,
 * and leaving the entry behind is how somebody ends up posting as the account
 * they thought they had left (GRYT-572).
 *
 * A guest membership is the opposite: it belongs to the *device*, is derived
 * from the seed in the Keychain, and has nothing to do with any account. Those
 * survive a sign-out, and would be destroyed by one if this list did not exist
 * to tell them apart.
 *
 * **Nothing else can tell them apart.** `JoinedServer` records what a server is
 * called and what it answered `/info` on, not who you were when you joined it,
 * and the join handshake is the only moment the answer is known —
 * `chooseTier` decides it and `onIdentityUsed` reports it. So it is written
 * down there and read here.
 *
 * Keyed by host, matching `useServers`, because a server is an address.
 *
 * Not a secret and not in the Keychain: it is a list of addresses this device
 * has already been to, which the server list beside it already holds.
 */

const KEY = "account.servers";
const OWNER_KEY = "account.servers.owner";

/**
 * Whose memberships these are, as the Keycloak subject.
 *
 * Stored beside the list because "leave the account's servers" needs to know
 * *which* account, and the answer has to survive the account being signed out —
 * which is exactly when there is no profile to ask. Without it the only
 * available signal is "signed out", and that fires for a session quietly
 * running out as much as for a person deciding something (GRYT-579).
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
