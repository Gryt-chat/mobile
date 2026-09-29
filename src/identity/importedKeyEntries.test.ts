import { isIdentityBackupEntry, type IdentityBackupEntry } from "@gryt/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const keychain = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (k: string) => keychain.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void keychain.set(k, v),
  deleteItemAsync: async (k: string) => void keychain.delete(k),
}));

const { importedKeyEntries, importedKeyFor, writeImportedKeys } = await import("./importedKeys");
const { deriveLocalKeyPair } = await import("./keys");

const SEED = Uint8Array.from({ length: 32 }, (_, i) => 90 - i);
const KEY = "gryt.identity.importedKeys";

async function randomKey(scope: string): Promise<IdentityBackupEntry> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    scope,
    host: "old.example",
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
}

describe("handing kept keys on to the next device (GRYT-1587)", () => {
  beforeEach(() => keychain.clear());

  it("gives nothing when nothing is kept", async () => {
    expect(await importedKeyEntries()).toEqual([]);
  });

  it("gives back each kept key as a backup entry the envelope accepts", async () => {
    const a = await randomKey("srv:a");
    const b = await randomKey("srv:b");
    await writeImportedKeys(SEED, [a, b]);

    const out = await importedKeyEntries();
    expect(out.map((e) => e.scope).sort()).toEqual(["srv:a", "srv:b"]);
    for (const entry of out) {
      expect(isIdentityBackupEntry(entry)).toBe(true);
      const sent = entry.scope === "srv:a" ? a : b;
      expect(entry.publicJwk).toMatchObject({ x: sent.publicJwk.x, y: sent.publicJwk.y });
      expect(entry.privateJwk.d).toBe(sent.privateJwk.d);
    }
  });

  it("round-trips: what one phone gives, the next keeps as the same key", async () => {
    const a = await randomKey("srv:a");
    await writeImportedKeys(SEED, [a]);
    const handed = await importedKeyEntries();

    keychain.clear();
    await writeImportedKeys(SEED, handed);
    expect((await importedKeyFor("srv:a"))?.publicJwk).toMatchObject({ x: a.publicJwk.x, y: a.publicJwk.y });
  });

  it("leaves out a stored key that's broken or doesn't match itself", async () => {
    const a = await randomKey("srv:a");
    const b = await randomKey("srv:b");
    const derived = deriveLocalKeyPair(SEED, "srv:c").publicJwk;
    keychain.set(
      KEY,
      JSON.stringify({
        "srv:a": { d: a.privateJwk.d, x: a.publicJwk.x, y: a.publicJwk.y },
        "srv:b": { d: a.privateJwk.d, x: b.publicJwk.x, y: b.publicJwk.y },
        "srv:c": { x: derived.x, y: derived.y },
      }),
    );
    expect((await importedKeyEntries()).map((e) => e.scope)).toEqual(["srv:a"]);

    keychain.set(KEY, "not json");
    expect(await importedKeyEntries()).toEqual([]);
  });
});
