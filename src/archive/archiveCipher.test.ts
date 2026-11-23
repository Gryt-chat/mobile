import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { afterEach, expect, it } from "vitest";

import { recordSealer, setArchiveCipher, type GcmCipher } from "./archiveKey";

// Stands in for CryptoKit and javax.crypto: AES-256-GCM, tag after the ciphertext.
const node: GcmCipher = {
  seal(key, iv, aad, plain) {
    const c = createCipheriv("aes-256-gcm", key, iv).setAAD(aad);
    return new Uint8Array(Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]));
  },
  open(key, iv, aad, sealed) {
    try {
      const d = createDecipheriv("aes-256-gcm", key, iv).setAAD(aad);
      d.setAuthTag(sealed.subarray(sealed.length - 16));
      return new Uint8Array(Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]));
    } catch {
      return null;
    }
  },
};

const random = (n: number) => new Uint8Array(randomBytes(n));
const key = random(32);
const plain = new TextEncoder().encode("group state");

afterEach(() => setArchiveCipher(null));

it("opens with the JS cipher what the platform one sealed, and back", async () => {
  setArchiveCipher(node);
  const byPlatform = await recordSealer(key, random).seal("mls:1", plain);
  setArchiveCipher(null);
  expect(await recordSealer(key, random).open("mls:1", byPlatform)).toEqual(plain);

  const byJs = await recordSealer(key, random).seal("mls:2", plain);
  setArchiveCipher(node);
  expect(await recordSealer(key, random).open("mls:2", byJs)).toEqual(plain);
});

it("still refuses a record moved to another context", async () => {
  setArchiveCipher(node);
  const sealed = await recordSealer(key, random).seal("mls:1", plain);
  await expect(recordSealer(key, random).open("mls:other", sealed)).rejects.toThrow();
});
