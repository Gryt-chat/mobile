import { createHash } from "node:crypto";

import { generateDeviceSignatureKeyPair, sealDmPreview, verifyDmPreviewKey, base64UrlDecode } from "@gryt/crypto";
import { describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_: string, text: string) => createHash("sha256").update(text).digest("hex"),
  getRandomBytes: (n: number) => new Uint8Array(n).map(() => Math.floor(Math.random() * 256)),
  randomUUID: () => "00000000-0000-0000-0000-000000000000",
}));
vi.mock("expo-notifications", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("../../modules/push-preview", () => ({ shareKeysWithExtension: () => true }));

const { dmPreviewRegistration, forgetDmPreview, openPushPreview, tagOf } = await import("./push");

const CAP = `p_${"a".repeat(43)}`;
storage.set("gryt:push", JSON.stringify({ token: "t", caps: { "srv.example": CAP }, issued: { "srv.example": Date.now() }, keys: {} }));

describe("DM lines a sender sealed to this phone (GRYT-2275)", () => {
  const device = { deviceId: "dev-1", ...generateDeviceSignatureKeyPair() };

  it("registers a signed key, opens what's sealed to it, and keeps the one before", async () => {
    const first = await dmPreviewRegistration("srv.example", device);
    expect(first && verifyDmPreviewKey(device.publicKey, "dev-1", base64UrlDecode(first.dmPreviewKey), first.dmPreviewSig)).toBe(true);
    const tag = await tagOf(CAP);
    const early = sealDmPreview(base64UrlDecode(first!.dmPreviewKey), "dev-1", { t: "Pingy", b: "hei", o: "dm_1" });

    const second = await dmPreviewRegistration("srv.example", device);
    expect(second!.dmPreviewKey).not.toBe(first!.dmPreviewKey);
    const late = sealDmPreview(base64UrlDecode(second!.dmPreviewKey), "dev-1", { t: "Pingy", b: "igjen" });
    expect(await openPushPreview(tag, late)).toEqual({ t: "Pingy", b: "igjen", d: 1 });
    expect(await openPushPreview(tag, early)).toEqual({ t: "Pingy", b: "hei", o: "dm_1", d: 1 });

    await dmPreviewRegistration("srv.example", device);
    expect(await openPushPreview(tag, early), "two kept, so the oldest is gone").toBeNull();
  });

  it("opens nothing once message text is turned off, or for another server's tag", async () => {
    const reg = await dmPreviewRegistration("srv.example", device);
    const blob = sealDmPreview(base64UrlDecode(reg!.dmPreviewKey), "dev-1", { t: "a", b: "b" });
    const tag = await tagOf(CAP);
    expect(await openPushPreview("0000000000000000", blob)).toBeNull();
    await forgetDmPreview("srv.example");
    expect(await openPushPreview(tag, blob)).toBeNull();
  });
});
