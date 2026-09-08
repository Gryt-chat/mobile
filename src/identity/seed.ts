import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { fromHex, toHex } from "./encoding";
import { SEED_BYTES, assertUsableSeed } from "./keys";

/**
 * **The one secret this app holds.** Every local identity comes from these 32 bytes,
 * hence the Keychain. **`WHEN_UNLOCKED_THIS_DEVICE_ONLY`**, so it stays off iCloud.
 */
const SEED_KEY = "gryt.identity.seed";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Read the seed, making one the first time. Stored as hex rather than base64url: it is
 * never transmitted, so size does not matter and unambiguity does.
 */
export async function getOrCreateSeed(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(SEED_KEY, OPTIONS);

  if (existing) {
    const seed = fromHex(existing);
    // Checked on the way out as well as the way in: a stored seed that fails this was
    // written by a broken generator, and deriving from it is being somebody else.
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
 * Replace the seed with one restored from elsewhere. Every membership under the old
 * seed stops being derivable, so this is not something to call speculatively.
 */
export async function restoreSeed(seed: Uint8Array): Promise<void> {
  assertUsableSeed(seed);
  await SecureStore.setItemAsync(SEED_KEY, toHex(seed), OPTIONS);
}
