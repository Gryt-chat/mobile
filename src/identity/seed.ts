import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { fromHex, toHex } from "./encoding";
import { SEED_BYTES, assertUsableSeed } from "./keys";

/**
 * The one secret this app holds.
 *
 * Every local identity on every server is derived from these 32 bytes, so
 * losing them loses every guest membership at once and copying them is copying
 * the person. That is why it is in the Keychain rather than in AsyncStorage
 * next to the server list.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — the seed does not travel to a new phone in
 * an iCloud backup. That is a deliberate trade and it is the same one the
 * desktop client makes by keeping keys in a non-extractable store: an identity
 * you can restore from a phrase is recoverable on purpose, and one that rides
 * along in an unencrypted backup is leaked by accident. Restoring on a new
 * device is what the recovery phrase is for.
 */
const SEED_KEY = "gryt.identity.seed";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Read the seed, making one the first time.
 *
 * Stored as hex rather than base64url because SecureStore holds strings and hex
 * has no alphabet to get wrong — this value is never transmitted, so its size
 * does not matter and its unambiguity does.
 */
export async function getOrCreateSeed(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(SEED_KEY, OPTIONS);

  if (existing) {
    const seed = fromHex(existing);
    // Checked on the way out as well as the way in. A stored seed that fails
    // this was written by a build whose generator was broken, and deriving from
    // it would make this device silently be somebody else.
    assertUsableSeed(seed);
    return seed;
  }

  const seed = Crypto.getRandomBytes(SEED_BYTES);
  assertUsableSeed(seed);

  await SecureStore.setItemAsync(SEED_KEY, toHex(seed), OPTIONS);
  return seed;
}

/** Whether an identity exists yet, without creating one. */
export async function hasSeed(): Promise<boolean> {
  return (await SecureStore.getItemAsync(SEED_KEY, OPTIONS)) !== null;
}

/**
 * Replace the seed with one restored from elsewhere.
 *
 * Every server this device is a member of under the old seed becomes
 * unreachable as that member — the identities are not deleted, they simply stop
 * being derivable. So this is not something to call speculatively.
 */
export async function restoreSeed(seed: Uint8Array): Promise<void> {
  assertUsableSeed(seed);
  await SecureStore.setItemAsync(SEED_KEY, toHex(seed), OPTIONS);
}
