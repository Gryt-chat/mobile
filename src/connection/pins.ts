import AsyncStorage from "@react-native-async-storage/async-storage";

import { SERVER_SCOPE_PREFIX, type ServerPin } from "../identity/serverProof";

/**
 * Which key each address is expected to answer with. Not in the Keychain: none of this
 * is secret, and it would be unreadable when the device is locked.
 */
const KEY = "serverPins";

type PinMap = Record<string, ServerPin>;

async function readAll(): Promise<PinMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PinMap) : {};
  } catch {
    // Unreadable storage means no pins, which downgrades to trust-on-first-use rather
    // than locking every server out — the position a fresh install is in.
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
    // Carried from what is already here rather than from the new pin. Today the same
    // string; when rotation lands, this is what keeps a DM key working across it.
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
 * What a DM key is derived under on this server. Not `identityScopeFor`, which is still
 * the address, and it must match the desktop character for character (GRYT-732).
 */
export async function dmScopeFor(host: string): Promise<string> {
  const pin = await getPin(host);
  if (!pin) return host;
  return `${SERVER_SCOPE_PREFIX}${pin.originKeyId ?? pin.keyId}`;
}
