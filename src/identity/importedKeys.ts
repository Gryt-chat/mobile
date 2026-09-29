import type { IdentityBackupEntry } from "@gryt/crypto";
import { p256 } from "@noble/curves/nist.js";
import * as SecureStore from "expo-secure-store";

import { base64Url, base64UrlDecode } from "./encoding";
import { deriveLocalKeyPair, type LocalKeyPair } from "./keys";

/* Guest keys a linked device handed over that the seed can't derive: the desktop's random
   ones from before the seed existed (GRYT-1579). By scope, and preferred over deriving. */
const KEY = "gryt.identity.importedKeys";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface StoredKey {
  /** The private scalar, base64url. */
  d: string;
  x: string;
  y: string;
}

/** The entry as a keypair, or null when it isn't a P-256 key whose halves belong together. */
function keyPairOf(entry: IdentityBackupEntry): LocalKeyPair | null {
  const { privateJwk: priv, publicJwk: pub } = entry;
  if (pub.kty !== "EC" || pub.crv !== "P-256" || !priv.d || !pub.x || !pub.y) return null;
  try {
    const scalar = base64UrlDecode(priv.d);
    if (scalar.length !== 32) return null;
    const point = p256.getPublicKey(scalar, false);
    const publicJwk = {
      kty: "EC" as const,
      crv: "P-256" as const,
      x: base64Url(point.subarray(1, 33)),
      y: base64Url(point.subarray(33, 65)),
    };
    if (publicJwk.x !== pub.x || publicJwk.y !== pub.y) return null;
    return { privateKey: scalar, publicJwk };
  } catch {
    return null;
  }
}

/**
 * Keep the entries `seed` can't reproduce, replacing whatever was kept before. A derived
 * one is dropped, since deriving gives the same key. Returns the scopes kept.
 */
export async function writeImportedKeys(seed: Uint8Array, entries: readonly IdentityBackupEntry[]): Promise<string[]> {
  const kept: Record<string, StoredKey> = {};
  for (const entry of entries) {
    const pair = keyPairOf(entry);
    if (!pair) continue;
    const derived = deriveLocalKeyPair(seed, entry.scope).publicJwk;
    if (derived.x === pair.publicJwk.x && derived.y === pair.publicJwk.y) continue;
    kept[entry.scope] = { d: base64Url(pair.privateKey), x: pair.publicJwk.x, y: pair.publicJwk.y };
  }

  if (Object.keys(kept).length === 0) {
    await clearImportedKeys();
  } else {
    await SecureStore.setItemAsync(KEY, JSON.stringify(kept), OPTIONS);
  }
  return Object.keys(kept);
}

/** The kept key for `scope`, or null. A locked Keychain throws rather than reading as none. */
export async function importedKeyFor(scope: string): Promise<LocalKeyPair | null> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!stored || typeof stored !== "object" || !Object.prototype.hasOwnProperty.call(stored, scope)) return null;

  const entry = (stored as Record<string, Partial<StoredKey>>)[scope];
  if (typeof entry?.d !== "string" || typeof entry.x !== "string" || typeof entry.y !== "string") return null;
  return keyPairOf({
    scope,
    privateJwk: { kty: "EC", crv: "P-256", d: entry.d, x: entry.x, y: entry.y },
    publicJwk: { kty: "EC", crv: "P-256", x: entry.x, y: entry.y },
  });
}

/** Every kept key, in the shape `exportLocalIdentities` writes, for a device this one links. */
export async function importedKeyEntries(): Promise<IdentityBackupEntry[]> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return [];
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!stored || typeof stored !== "object") return [];

  const entries: IdentityBackupEntry[] = [];
  for (const [scope, entry] of Object.entries(stored as Record<string, Partial<StoredKey>>)) {
    if (typeof entry?.d !== "string" || typeof entry.x !== "string" || typeof entry.y !== "string") continue;
    const candidate: IdentityBackupEntry = {
      scope,
      privateJwk: { kty: "EC", crv: "P-256", d: entry.d, x: entry.x, y: entry.y },
      publicJwk: { kty: "EC", crv: "P-256", x: entry.x, y: entry.y },
    };
    // Only a pair that still belongs together goes out; the other side would skip it anyway.
    if (keyPairOf(candidate)) entries.push(candidate);
  }
  return entries;
}

/** Drop every kept key, as a new seed does: each one belongs to whoever had the old seed. */
export async function clearImportedKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
