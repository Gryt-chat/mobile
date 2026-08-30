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
 * Not `identityScopeFor`, which is the address and is staying the address until
 * GRYT-517 migrates it. The two answer different questions and only one of them
 * has history behind it: a guest identity filed under the address has roles and
 * a message history that a change of scope would abandon, and a DM key has
 * neither — it is derived from the seed on demand, and rederiving it under a
 * better name costs a republished binding.
 *
 * So DM keys start where the desktop already is. The string has to match the
 * desktop's exactly, character for character, because it is the *same person's*
 * key on both: a phone and a laptop holding one seed derive one DM key for one
 * server, publish one binding, and the second device does not overwrite the
 * first with something nobody else can open. `srv:` and the origin key id, the
 * same as `identityScopeFor` in the client's `identity-keys.ts`.
 *
 * Null when nothing is pinned, which is a server that offered no proof. There is
 * no lineage to name then, and the desktop falls back to the address — so this
 * does too, at the call site, where the host is already in hand.
 */
export async function dmScopeFor(host: string): Promise<string> {
  const pin = await getPin(host);
  if (!pin) return host;
  return `${SERVER_SCOPE_PREFIX}${pin.originKeyId ?? pin.keyId}`;
}
