import { beforeEach, describe, expect, it, vi } from "vitest";

const keychain = new Map<string, string>();
let icloud: string | null = null;
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (k: string) => keychain.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void keychain.set(k, v),
  deleteItemAsync: async (k: string) => void keychain.delete(k),
}));
vi.mock("expo-crypto", () => ({ getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 251) }));
vi.mock("../../modules/synced-seed", () => ({
  readSyncedSeed: async () => icloud,
  writeSyncedSeed: async (hex: string) => {
    icloud = hex;
    return true;
  },
}));

const { getOrCreateSeed, restoreSeed } = await import("./seed");
const { toHex } = await import("./encoding");

const SEED_KEY = "gryt.identity.seed";
const OTHER = Uint8Array.from({ length: 32 }, (_, i) => (i * 11 + 5) % 251);

describe("the seed in iCloud Keychain (GRYT-1879)", () => {
  beforeEach(() => {
    keychain.clear();
    icloud = null;
  });

  it("puts a new phone's seed in iCloud too", async () => {
    const seed = await getOrCreateSeed();
    expect(icloud).toBe(toHex(seed));
  });

  it("gives a new or restored phone the seed iCloud has, so the key is the same", async () => {
    icloud = toHex(OTHER);
    expect(await getOrCreateSeed()).toEqual(OTHER);
    expect(keychain.get(SEED_KEY)).toBe(toHex(OTHER));
  });

  it("copies a phone's existing seed up once, and keeps its own when iCloud holds another", async () => {
    keychain.set(SEED_KEY, toHex(OTHER));
    await getOrCreateSeed();
    expect(icloud).toBe(toHex(OTHER));

    const mine = Uint8Array.from({ length: 32 }, (_, i) => (i * 13 + 9) % 251);
    keychain.set(SEED_KEY, toHex(mine));
    expect(await getOrCreateSeed()).toEqual(mine);
    expect(icloud, "a different seed in iCloud is left alone").toBe(toHex(OTHER));
  });

  it("follows a restore or a link into iCloud, since that's the account's key now", async () => {
    icloud = toHex(OTHER);
    const restored = Uint8Array.from({ length: 32 }, (_, i) => (i * 17 + 1) % 251);
    await restoreSeed(restored);
    expect(icloud).toBe(toHex(restored));
  });
});
