import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { openDatabaseAsync } from "expo-sqlite";
import { useSyncExternalStore } from "react";

import { ArchiveDb } from "./archiveDb";
import type { KeyVault } from "./archiveKey";
import { createArchiveOpener, type LocalArchive, type LocalArchiveSnapshot } from "./archiveOpener";

export { ArchiveKeyError, type ArchiveKeyErrorCode } from "./archiveKey";
export type { LocalArchive, LocalArchiveSnapshot, LocalArchiveStatus } from "./archiveOpener";

const DB_NAME = "gryt-archive.db";
const KEY_NAME = "gryt.archive.key";

/** Readable after the first unlock since boot, so a push can wake the app to decrypt (decision 12). */
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychain: KeyVault = {
  read: () => SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS),
  write: (value) => SecureStore.setItemAsync(KEY_NAME, value, KEY_OPTIONS),
  remove: () => SecureStore.deleteItemAsync(KEY_NAME, KEY_OPTIONS),
};

/** One connection for the life of the app. A retry asks the Keychain again, not SQLite. */
let database: Promise<ArchiveDb> | null = null;
function openDb(): Promise<ArchiveDb> {
  database ??= openDatabaseAsync(DB_NAME)
    .then((sql) => ArchiveDb.open(sql))
    .catch((e: unknown) => {
      database = null;
      throw e;
    });
  return database;
}

const opener = createArchiveOpener({ openDb, vault: keychain, random: Crypto.getRandomBytes });

/** Opened once per launch. A failure isn't cached, so a later call tries again. */
export function openLocalArchive(): Promise<LocalArchive> {
  return opener.open();
}

/** Only on the person's say-so: what this phone decrypted is gone for good. */
export function clearLocalArchive(): Promise<LocalArchive> {
  return opener.clear();
}

export const subscribeToLocalArchive = opener.subscribe;
export const getLocalArchiveSnapshot = opener.snapshot;

export function useLocalArchive(): LocalArchiveSnapshot {
  return useSyncExternalStore(opener.subscribe, opener.snapshot, opener.snapshot);
}
