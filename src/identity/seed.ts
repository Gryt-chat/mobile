import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { IdentityBackupEntry } from "@gryt/crypto";

import { readSyncedSeed, writeSyncedSeed } from "../../modules/synced-seed";
import { fromHex, toHex } from "./encoding";
import { clearImportedKeys, writeImportedKeys } from "./importedKeys";
import { SEED_BYTES, assertUsableSeed } from "./keys";

/**
 * **The one secret this app holds.** This device's copy, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. A second
 * copy rides iCloud Keychain or Block Store (`modules/synced-seed`), so a new phone has the same key.
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
    // A phone from before GRYT-1879 puts its seed in iCloud once. One that differs is left there:
    // the server's one-key check (GRYT-1868) decides which is the account's.
    if ((await readSyncedSeed()) === null) await writeSyncedSeed(existing);
    return seed;
  }

  const synced = await readSyncedSeed();
  if (synced) {
    try {
      const seed = fromHex(synced);
      assertUsableSeed(seed);
      await SecureStore.setItemAsync(SEED_KEY, synced, OPTIONS);
      return seed;
    } catch {
      // A damaged copy in iCloud makes a new key here rather than none at all.
    }
  }

  const seed = Crypto.getRandomBytes(SEED_BYTES);
  assertUsableSeed(seed);

  await SecureStore.setItemAsync(SEED_KEY, toHex(seed), OPTIONS);
  await writeSyncedSeed(toHex(seed));
  return seed;
}

/** Whether an identity exists yet, without creating one. */
export async function hasSeed(): Promise<boolean> {
  return (await SecureStore.getItemAsync(SEED_KEY, OPTIONS)) !== null || (await readSyncedSeed()) !== null;
}

/**
 * Replace the seed with one restored from elsewhere. Every membership under the old
 * seed stops being derivable, so this is not something to call speculatively.
 */
export async function restoreSeed(seed: Uint8Array): Promise<void> {
  assertUsableSeed(seed);
  await clearImportedKeys();
  await SecureStore.setItemAsync(SEED_KEY, toHex(seed), OPTIONS);
  // Restored or linked on purpose: this is the account's key now, so iCloud follows.
  await writeSyncedSeed(toHex(seed));
}

/** Become the identity a linking device handed over: its seed, and the keys the seed can't derive. */
export async function installPairedIdentity(seed: Uint8Array, keys: readonly IdentityBackupEntry[]): Promise<void> {
  await restoreSeed(seed);
  await writeImportedKeys(seed, keys);
}
