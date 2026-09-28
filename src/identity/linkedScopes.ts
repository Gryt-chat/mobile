import AsyncStorage from "@react-native-async-storage/async-storage";

import { identityScopeFor } from "./scope";

/* Where a linked device's guest keys derive, per server, when the device that linked it
   used another scope: the desktop derives under `srv:<lineage>`, this phone under the address. */
const KEY = "identity.linkedScopes";

let cache: Promise<Record<string, string>> | null = null;

function readAll(): Promise<Record<string, string>> {
  cache ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
      );
    })
    // Unreadable means the address, which is what this phone derived under before linking existed.
    .catch(() => ({}));
  return cache;
}

/** What the guest key for `host` derives under: the scope a linked device was given, or the address. */
export async function derivationScopeFor(host: string): Promise<string> {
  return (await readAll())[identityScopeFor(host)] ?? host;
}

/** Replaces the whole map. Only scopes that differ from the address are kept. */
export async function writeLinkedScopes(scopes: { host: string; scope: string }[]): Promise<void> {
  const next: Record<string, string> = {};
  for (const { host, scope } of scopes) {
    const key = identityScopeFor(host);
    if (scope !== key) next[key] = scope;
  }
  cache = Promise.resolve(next);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

/** For tests. */
export function resetLinkedScopes(): void {
  cache = null;
}
