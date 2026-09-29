import { asIdentityScope, decodePairingEnvelope, encodePairingEnvelope, type IdentityBackupEntry } from "@gryt/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commitLink } from "../pairing/commit";

const keychain = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (k: string) => keychain.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void keychain.set(k, v),
  deleteItemAsync: async (k: string) => void keychain.delete(k),
}));
vi.mock("expo-crypto", () => ({ getRandomBytes: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)) }));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
  },
}));
vi.mock("../servers/address", () => ({ normalizeHost: (h: string) => h.trim().toLowerCase() }));

const { signAssertion } = await import("./certificate");
const { base64Url, base64UrlDecode, utf8 } = await import("./encoding");
const { deriveLocalKeyPair, subjectFor } = await import("./keys");
const { writeLinkedScopes, resetLinkedScopes } = await import("./linkedScopes");
const { getLocalIdentity } = await import("./localIdentity");
const { installPairedIdentity, restoreSeed } = await import("./seed");

const SEED = Uint8Array.from({ length: 32 }, (_, i) => 40 + i);
const OLD_SCOPE = "srv:lineage-old";
const IMPORTED = "gryt.identity.importedKeys";

/** A random key made the way the desktop made guest keys before the seed. */
async function desktopKey(scope: string): Promise<IdentityBackupEntry> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    scope,
    host: "old.example",
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
}

/** What `exportLocalIdentities` writes for a scope the seed derives. */
function derivedEntry(scope: string): IdentityBackupEntry {
  const { privateKey, publicJwk } = deriveLocalKeyPair(SEED, scope);
  return { scope, privateJwk: { ...publicJwk, d: base64Url(privateKey) }, publicJwk };
}

/** The phone's own identity stores behind a link, with the rest of the phone left out. */
async function link(keys: IdentityBackupEntry[]) {
  const sent = encodePairingEnvelope({
    seed: SEED,
    keys,
    servers: [
      { host: "old.example", name: "Old", scope: asIdentityScope(OLD_SCOPE) },
      { host: "chat.example", name: "Chat", scope: asIdentityScope("srv:lineage-1") },
    ],
    pins: {},
    from: "Sivert's MacBook",
  });
  await commitLink(decodePairingEnvelope(sent), null, {
    setAuthServer: async () => undefined,
    installIdentity: installPairedIdentity,
    writeScopes: writeLinkedScopes,
    mergePins: async () => undefined,
    markSeenOnMls: async () => undefined,
    adoptTokens: async () => undefined,
    addServer: async () => undefined,
  });
}

/** Whether the server, holding the desktop's public key, would take this assertion. */
async function desktopKeyVerifies(entry: IdentityBackupEntry, jwt: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("jwk", entry.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const [h, p, sig] = jwt.split(".");
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, new Uint8Array(base64UrlDecode(sig)), new Uint8Array(utf8(`${h}.${p}`)));
}

describe("keys a linked phone gets that its seed can't derive", () => {
  beforeEach(() => {
    keychain.clear();
    storage.clear();
    resetLinkedScopes();
  });

  it("joins as the desktop's pre-seed guest, and the desktop's key verifies it", async () => {
    const old = await desktopKey(OLD_SCOPE);
    await link([old, derivedEntry("srv:lineage-1")]);

    const me = await getLocalIdentity("old.example");
    expect(me.publicJwk).toMatchObject({ x: old.publicJwk.x, y: old.publicJwk.y });
    expect(me.sub).toBe(subjectFor({ kty: "EC", crv: "P-256", x: old.publicJwk.x!, y: old.publicJwk.y! }));
    expect(await desktopKeyVerifies(old, signAssertion(me, "old.example", "nonce-1"))).toBe(true);
    expect(await desktopKeyVerifies(old, me.certificate)).toBe(true);
  });

  it("still derives everywhere else, and keeps only what it couldn't", async () => {
    await link([await desktopKey(OLD_SCOPE), derivedEntry("srv:lineage-1")]);

    const chat = await getLocalIdentity("chat.example");
    expect(chat.publicJwk).toEqual(deriveLocalKeyPair(SEED, "srv:lineage-1").publicJwk);
    expect(Object.keys(JSON.parse(keychain.get(IMPORTED)!))).toEqual([OLD_SCOPE]);
  });

  it("skips an entry whose halves don't belong together", async () => {
    const old = await desktopKey(OLD_SCOPE);
    const other = await desktopKey(OLD_SCOPE);
    await link([{ ...old, publicJwk: other.publicJwk }]);

    expect(keychain.has(IMPORTED)).toBe(false);
    expect((await getLocalIdentity("old.example")).publicJwk).toEqual(deriveLocalKeyPair(SEED, OLD_SCOPE).publicJwk);
  });

  it("forgets them on a phrase restore, and a second link replaces them", async () => {
    const first = await desktopKey(OLD_SCOPE);
    await link([first]);
    await restoreSeed(SEED);
    expect(keychain.has(IMPORTED)).toBe(false);
    expect((await getLocalIdentity("old.example")).publicJwk).toEqual(deriveLocalKeyPair(SEED, OLD_SCOPE).publicJwk);

    await link([first]);
    const second = await desktopKey(OLD_SCOPE);
    await installPairedIdentity(SEED, [second]);
    expect((await getLocalIdentity("old.example")).publicJwk).toMatchObject({ x: second.publicJwk.x });
  });
});
