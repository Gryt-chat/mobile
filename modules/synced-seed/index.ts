import { requireOptionalNativeModule } from "expo-modules-core";

/* iCloud Keychain on iOS, Block Store on Android. Null in tests and on builds from before GRYT-1879. */
const native = requireOptionalNativeModule<{ read(): Promise<string | null>; write(value: string): Promise<boolean> }>(
  "SyncedSeed",
);

/** The seed as iCloud Keychain or Block Store holds it, hex. Null when there's none. */
export async function readSyncedSeed(): Promise<string | null> {
  return (await native?.read().catch(() => null)) ?? null;
}

/** False when it couldn't be kept there, which leaves this device's own copy as the only one. */
export async function writeSyncedSeed(hex: string): Promise<boolean> {
  return (await native?.write(hex).catch(() => false)) ?? false;
}
