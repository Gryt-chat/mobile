import { describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, v: string) => void disk.set(k, v),
    removeItem: async (k: string) => void disk.delete(k),
  },
}));

const { cacheDetails, forgetCachedDetails, readCachedDetails } = await import("./detailsCache");

const ready = { status: "ready" as const, channels: [], sidebar: [], stunHosts: ["stun:x"] };

describe("detailsCache", () => {
  it("comes back marked as cached, and is gone once forgotten", async () => {
    cacheDetails("a", ready);
    await Promise.resolve();
    expect(await readCachedDetails("a")).toEqual({ ...ready, details: undefined, cached: true });
    await forgetCachedDetails("a");
    expect(await readCachedDetails("a")).toBeNull();
  });

  it("ignores what isn't a channel list", async () => {
    disk.set("serverDetails:b", "{not json");
    disk.set("serverDetails:c", JSON.stringify({ status: "error" }));
    expect(await readCachedDetails("b")).toBeNull();
    expect(await readCachedDetails("c")).toBeNull();
  });
});
