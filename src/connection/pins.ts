import AsyncStorage from "@react-native-async-storage/async-storage";

import { SERVER_SCOPE_PREFIX, type ServerPin } from "../identity/serverProof";

/**
 * Which key each address is expected to answer with.
 *
 * Not in the Keychain: none of this is secret. It is public keys and the
 * addresses they were seen at, and the property that matters is that it cannot
 * be *changed* by anything but this app — which is what app-private storage
 * already gives. Putting it behind the Keychain would gain nothing and make it
 * unreadable when the device is locked, which is when a reconnect happens.
 */
const KEY = "serverPins";

type PinMap = Record<string, ServerPin>;

async function readAll(): Promise<PinMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PinMap) : {};
  } catch {
    // Unreadable storage means no pins, which downgrades to trust-on-first-use
    // rather than locking every server out. It is the same position a fresh
    // install is in.
    return {};
  }
}

export async function getPin(host: string): Promise<ServerPin | null> {
  return (await readAll())[host] ?? null;
}

export async function savePin(host: string, pin: ServerPin): Promise<void> {
  const all = await readAll();
  all[host] = {
    ...pin,
    // Carried from whatever is already here rather than taken from the new pin.
    // Today they are always the same string — a rotated server is refused, so a
    // pin is only ever written for a key this address has always answered with.
    // When rotation lands, this is the line that keeps a DM key working across
    // it, and it is cheaper to have written it from the start than to migrate
    // pins that never recorded a lineage.
    originKeyId: all[host]?.originKeyId ?? all[host]?.keyId ?? pin.keyId,
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Kept for this run only. The next connection re-pins, which is a weaker
    // guarantee than intended but better than refusing to connect.
  }
}

export async function forgetPin(host: string): Promise<void> {
  const all = await readAll();
  delete all[host];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/**
 * What a DM key is derived under on this server (GRYT-732).
 *
 * **Not `identityScopeFor`**, which is the address until GRYT-517 migrates it.
 * A guest identity filed under the address has roles and history a change of
 * scope would abandon; a DM key has neither and costs a republished binding.
 *
 * **The string has to match the desktop's character for character**, because it
 * is the same person's key on both — otherwise the second device overwrites the
 * first with a binding nobody else can open. `srv:` and the origin key id.
 *
 * Null when nothing is pinned, and the caller falls back to the address, as the
 * desktop does.
 */
export async function dmScopeFor(host: string): Promise<string> {
  const pin = await getPin(host);
  if (!pin) return host;
  return `${SERVER_SCOPE_PREFIX}${pin.originKeyId ?? pin.keyId}`;
}
