import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ServerPin } from "../identity/serverProof";

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
  all[host] = pin;
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
