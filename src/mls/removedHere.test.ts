import { describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => void disk.set(key, value),
    removeItem: async (key: string) => void disk.delete(key),
    getAllKeys: async () => [...disk.keys()],
    multiRemove: async (keys: string[]) => keys.forEach((k) => disk.delete(k)),
  },
}));

const removed = await import("./removedHere");
const { mlsNotice } = await import("./timeline");
const { retireOldDevices } = await import("./retireDevices");

describe("a phone removed from MLS (GRYT-1555)", () => {
  it("stays removed until a sign-in after the removal, or a restore", async () => {
    await removed.markRemovedHere("srv:a", 5_000_000);
    await removed.markRemovedHere("srv:b", 6_000_000);
    expect(await removed.removedHereAt("srv:a")).toBe(5_000_000);

    expect(removed.stillRemoved(5_000_000, null)).toBe(true);
    expect(removed.stillRemoved(5_000_000, 4_000)).toBe(true);
    expect(removed.stillRemoved(5_000_000, 5_001)).toBe(false);

    const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
    expect(removed.authTimeOf(token({ auth_time: 5_001 }))).toBe(5_001);
    expect(removed.authTimeOf(token({ sub: "x" }))).toBeNull();
    expect(removed.authTimeOf(undefined)).toBeNull();

    await removed.clearRemovedHere("srv:a");
    expect(await removed.removedHereAt("srv:a")).toBeNull();
    const heard = vi.fn();
    const off = removed.onRemovedCleared(heard);
    await removed.clearRemovedEverywhere();
    off();
    expect(await removed.removedHereAt("srv:b")).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("still sends version 1 to a peer without MLS, and nothing else", async () => {
    const base = {
      storeScope: "srv:a",
      modeFor: vi.fn(async (_c: string, peer: string) =>
        peer === "old" ? ({ kind: "sealed-v1", reason: "peer_without_mls" } as const) : Promise.reject(new Error("archive_closed")),
      ),
      send: vi.fn(),
      problems: vi.fn(),
      onChange: () => () => undefined,
    };
    const source = removed.removedSource(base);
    expect(await source.modeFor("c1", "old")).toEqual({ kind: "sealed-v1", reason: "peer_without_mls" });
    expect(await source.modeFor("c2", "ola")).toEqual({ kind: "refused", reason: "no_own_device" });
    await expect(source.send("c2", "ola", { type: "message", text: "hei" } as never)).rejects.toMatchObject({ code: "device_removed" });
    expect(base.send).not.toHaveBeenCalled();
    expect(source.problems("c2")).toEqual({ undecryptable: 0, lost: "device_removed" });
  });

  it("says so in the DM, and how to set it up again", () => {
    const problems = { undecryptable: 0, lost: "device_removed" as const };
    const refused = { kind: "refused", reason: "no_own_device" } as const;
    expect(mlsNotice(refused, problems, false, "Ola", true)).toBe(
      "This phone was removed from encrypted DMs on this server. To set it up again, sign out and sign back in.",
    );
    expect(mlsNotice(refused, problems, false, "Ola")).toMatch(/restore your identity from your 24 words\.$/);
    expect(mlsNotice({ kind: "sealed-v1", reason: "peer_without_mls" }, problems, false, "Ola")).toBeNull();
  });

  it("counts an old device the server already removed as retired", async () => {
    const forgotten: string[] = [];
    await retireOldDevices(
      {
        storeScope: "srv:a",
        removeOwnDevice: async () => Promise.reject(Object.assign(new Error("gone"), { refusal: { error: "device_removed" } })),
      },
      {
        retiredMlsDevices: async () => ["old"],
        forgetRetiredMlsDevice: async (_s: string, id: string) => void forgotten.push(id),
        mlsState: () => ({ loadDevice: async () => null }) as never,
      },
    );
    expect(forgotten).toEqual(["old"]);
  });
});
