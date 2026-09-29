import { afterEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (key: string) => disk.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void disk.set(key, value),
  deleteItemAsync: async (key: string) => void disk.delete(key),
}));

import { attachmentUrl } from "../chat/files";
import { fileAccessParams, forgetFileAccess, hasFileAccess, holdFileAccess, signFileUrl } from "./fileAccess";
import { applyFileAccess, restoreFileToken } from "./tokens";

/**
 * Upload URLs carried the file token in `?t=`, where logs and screenshots kept it and no
 * identity proof could hold it back. Now each is signed for one file for minutes (GRYT-1549).
 */

const HOST = "chat.example.com";
const FILE = "0f8a3c52-6a8e-4b8e-9d0e-2f7c1b1e4a90";
const NOW = 1_790_000_000_000;
const KEY = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";
const grant = { fileKey: { key: KEY, user: "user-1", until: 1_790_043_200, now: NOW }, fileToken: "file-token-jwt" };
const carries = (url: string) => ["t", "s", "u", "k", "e"].filter((name) => new URL(url).searchParams.has(name));

afterEach(() => {
  forgetFileAccess(HOST);
  forgetFileAccess("old.example.com");
  disk.clear();
});

describe("signed upload URLs", () => {
  it("signs the same bytes as the server", () => {
    // The server's own vector, in server src/utils/fileUrl.test.ts. Different bytes and every picture 401s.
    const key = new Uint8Array(32).fill(7);
    expect(signFileUrl(key, FILE, false, 1790000100)).toBe("inQYY_jLD5cG4YmQa-Lj6x5PoUM07mxSLe3TYDBpUjY");
    expect(signFileUrl(key, FILE, true, 1790000100)).toBe("PsNKwED5XP3kVQzI8Hd9VLIVDSxRGXbQ1xy3yoJYvBg");
  });

  it("carries nothing before the socket has handed anything over", () => {
    expect(carries(attachmentUrl(HOST, FILE, true))).toEqual([]);
  });

  it("signs one file for five to ten minutes, and leaves the token out", () => {
    holdFileAccess(HOST, grant, NOW);
    const params = Object.fromEntries(fileAccessParams(HOST, FILE, false, NOW));
    expect(params.u).toBe("user-1");
    expect(params.k).toBe("1790043200");
    const ahead = Number(params.e) - NOW / 1000;
    expect(ahead).toBeGreaterThanOrEqual(300);
    expect(ahead).toBeLessThanOrEqual(600);
    expect(params.s).toBe(signFileUrl(new Uint8Array(32).fill(7), FILE, false, Number(params.e)));

    const url = attachmentUrl(HOST, FILE);
    expect(carries(url).sort()).toEqual(["e", "k", "s", "u"]);
    expect(url).not.toContain("file-token-jwt");
  });

  it("gives another file, and the full size of a thumbnail, another signature", () => {
    holdFileAccess(HOST, grant, NOW);
    const sig = (file: string, thumb: boolean) => fileAccessParams(HOST, file, thumb, NOW)[3][1];
    expect(sig("file-a", false)).not.toBe(sig("file-b", false));
    expect(sig("file-a", false)).not.toBe(sig("file-a", true));
  });

  it("holds still inside a five-minute step and moves on after it", () => {
    holdFileAccess(HOST, grant, NOW);
    const expires = (ms: number) => fileAccessParams(HOST, FILE, false, ms)[2][1];
    const step = Math.floor(NOW / 300_000) * 300_000;
    expect(expires(step)).toBe(expires(step + 299_000));
    expect(expires(step)).not.toBe(expires(step + 300_000));
  });

  it("uses the server's clock, so a phone an hour fast still signs what the server accepts", () => {
    const fast = NOW + 60 * 60 * 1000;
    holdFileAccess(HOST, grant, fast);
    expect(Number(fileAccessParams(HOST, FILE, false, fast)[2][1]) - NOW / 1000).toBeLessThanOrEqual(600);
  });

  it("forgets a server, after which nothing is signed for it", () => {
    holdFileAccess(HOST, grant, NOW);
    forgetFileAccess(HOST);
    expect(carries(attachmentUrl(HOST, FILE))).toEqual([]);
  });
});

describe("an older server's file token", () => {
  it("goes in `?t=` when that is all the server sends, and is kept for the next launch", async () => {
    await applyFileAccess("old.example.com", { fileToken: "legacy" });
    expect(fileAccessParams("old.example.com", FILE, false)).toEqual([["t", "legacy"]]);
    expect([...disk.values()]).toEqual(["legacy"]);

    // Next launch: nothing until the proof, then the stored token.
    forgetFileAccess("old.example.com");
    expect(hasFileAccess("old.example.com")).toBe(false);
    await restoreFileToken("old.example.com");
    expect(fileAccessParams("old.example.com", FILE, false)).toEqual([["t", "legacy"]]);
  });

  it("comes off the disk once the server sends a key", async () => {
    await applyFileAccess(HOST, { fileToken: "legacy" });
    await applyFileAccess(HOST, grant);
    expect(disk.size).toBe(0);
    expect(carries(attachmentUrl(HOST, FILE))).not.toContain("t");
  });

  it("is not taken over a key that is already held", async () => {
    await applyFileAccess(HOST, { fileToken: "legacy" });
    holdFileAccess(HOST, grant, NOW);
    await restoreFileToken(HOST);
    expect(carries(attachmentUrl(HOST, FILE))).not.toContain("t");
  });
});
