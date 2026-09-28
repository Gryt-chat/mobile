/* Copied from `src/mls/interfaces.ts` in @gryt/core (GRYT-1512), which isn't released yet.
   Delete this file and import from @gryt/core once the pin moves; the shapes must not drift. */

/** This device's leaf key and certificate, from `createMlsDevice` in @gryt/crypto. */
export interface MlsDeviceRecord {
  deviceId: string;
  signKey: Uint8Array;
  publicKey: Uint8Array;
  certificate: Uint8Array;
}

/** The private half of a published KeyPackage, found again by the ref a Welcome names. */
export interface MlsKeyPackageRecord {
  ref: string;
  keyPackage: Uint8Array;
  privatePackage: Uint8Array;
  lastResort: boolean;
  /** Milliseconds. */
  createdAt: number;
  /** Seconds, from `generateMlsKeyPackage`. Absent on records written before 0.7.0. */
  expiresAt?: number;
}

/**
 * One group. `state` and `cursor` are always written together (design, section 2).
 * `pending` is a commit sent but not yet seen accepted, so a crash can't strand it.
 */
export interface MlsGroupRecord {
  conversationId: string;
  groupId: string;
  state: Uint8Array;
  cursor: number;
  /** Entries from before this epoch were never meant for this device. */
  joinedEpoch: number;
  pending?: { commit: Uint8Array; state: Uint8Array };
}

/**
 * One store per server. Keep it out of OS backups: restored MLS state is out of sync. On the
 * web, only the tab holding the Web Lock may write.
 */
export interface MlsStateStore {
  loadDevice(): Promise<MlsDeviceRecord | null>;
  saveDevice(device: MlsDeviceRecord): Promise<void>;

  putKeyPackages(records: MlsKeyPackageRecord[]): Promise<void>;
  getKeyPackage(ref: string): Promise<MlsKeyPackageRecord | null>;
  listKeyPackages(): Promise<MlsKeyPackageRecord[]>;
  deleteKeyPackage(ref: string): Promise<void>;

  loadGroup(conversationId: string): Promise<MlsGroupRecord | null>;
  listGroups(): Promise<MlsGroupRecord[]>;
  saveGroup(record: MlsGroupRecord): Promise<void>;
  deleteGroup(conversationId: string): Promise<void>;
}
