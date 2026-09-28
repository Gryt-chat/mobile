import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { openDatabaseAsync } from "expo-sqlite";

import { ArchiveDb } from "./archiveDb";
import { type KeyVault, loadArchiveKey } from "./archiveKey";
import { MessageArchive } from "./messageArchive";
import { SqliteMlsStateStore } from "./mlsStateStore";

const DB_NAME = "gryt-archive.db";
const KEY_NAME = "gryt.archive.key";

/** Readable after the first unlock since boot, so a push can wake the app to decrypt (decision 12). */
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychain: KeyVault = {
  read: () => SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS),
  write: (value) => SecureStore.setItemAsync(KEY_NAME, value, KEY_OPTIONS),
};

export interface LocalArchive {
  messages: MessageArchive;
  /** Matches the desktop's field. The phone's history lives in the app, never a browser. */
  home: "app";
  sealed: true;
  /** An archive was found whose key had gone, as after a restore onto a new phone, and was cleared. */
  lostHistory: boolean;
  /** One per server, keyed by the scope `identityScopeFor` gives. */
  mlsState(scope: string): SqliteMlsStateStore;
}

let opening: Promise<LocalArchive> | null = null;

async function open(): Promise<LocalArchive> {
  const db = await ArchiveDb.open(await openDatabaseAsync(DB_NAME));
  const { sealer, lostHistory } = await loadArchiveKey(db, keychain, Crypto.getRandomBytes);
  return {
    messages: new MessageArchive(db, sealer),
    home: "app",
    sealed: true,
    lostHistory,
    mlsState: (scope) => new SqliteMlsStateStore(db, sealer, scope),
  };
}

/** Opened once per launch. A failure isn't cached, so a later call tries again. */
export function openLocalArchive(): Promise<LocalArchive> {
  opening ??= open().catch((e: unknown) => {
    opening = null;
    throw e;
  });
  return opening;
}
