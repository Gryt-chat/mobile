import AsyncStorage from "@react-native-async-storage/async-storage";
import { sha256 } from "@noble/hashes/sha2.js";

import { base64Url } from "./encoding";

/* What a seed and a scope fix for good. Each derivation is BigInt curve maths, 30-200 ms on Hermes. */
const pairs = new Map<string, object>();
const publics = new Map<string, string>();

function keyFor(kind: string, seed: Uint8Array, scope: string): string {
  return `${kind}\n${base64Url(sha256(seed).subarray(0, 16))}\n${scope}`;
}

/** Worked out once per run. For anything holding a private key. */
export function fromSeed<T extends object>(kind: string, seed: Uint8Array, scope: string, derive: () => T): T {
  const key = keyFor(kind, seed, scope);
  const held = pairs.get(key) as T | undefined;
  if (held) return held;
  const made = derive();
  pairs.set(key, made);
  return made;
}

/** Worked out once per install and kept on disk. Only for public values. */
export async function publicFromSeed(
  kind: string,
  seed: Uint8Array,
  scope: string,
  derive: () => string | Promise<string>,
): Promise<string> {
  const key = keyFor(kind, seed, scope);
  const held = publics.get(key);
  if (held !== undefined) return held;
  const stored = await AsyncStorage.getItem(`derived:${key}`).catch(() => null);
  const value = stored ?? (await derive());
  publics.set(key, value);
  if (!stored) void AsyncStorage.setItem(`derived:${key}`, value).catch(() => undefined);
  return value;
}
