import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    async getItem(key: string) {
      return disk.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      disk.set(key, value);
    },
  },
}));

const { getRecentReactions, recordReaction } = await import("./recentReactions");

let now = 1_000_000;

beforeEach(() => {
  disk.clear();
  // Every call gets its own millisecond, so recency never ties by accident.
  vi.spyOn(Date, "now").mockImplementation(() => (now += 1000));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stored(host: string): { src: string; count: number }[] {
  return JSON.parse(disk.get(`gryt:recentReactions:${host}`) ?? "[]");
}

describe("recordReaction", () => {
  it("puts a first use at the front", async () => {
    await recordReaction("\u{1F680}", "gryt.test");
    expect(await getRecentReactions(1, "gryt.test")).toEqual(["\u{1F680}"]);
  });

  it("counts repeats rather than duplicating the entry", async () => {
    await recordReaction("\u{1F680}", "gryt.test");
    await recordReaction("\u{1F680}", "gryt.test");
    await recordReaction("\u{1F389}", "gryt.test");

    expect(stored("gryt.test").map((r) => [r.src, r.count])).toEqual([
      ["\u{1F680}", 2],
      ["\u{1F389}", 1],
    ]);
  });

  it("keeps the most used when trimming, not the newest", async () => {
    await recordReaction("\u{1F680}", "gryt.test");
    await recordReaction("\u{1F680}", "gryt.test");
    for (let i = 0; i < 30; i++) await recordReaction(`one-off-${i}`, "gryt.test");

    expect(stored("gryt.test")).toHaveLength(30);
    expect(stored("gryt.test").some((r) => r.src === "\u{1F680}")).toBe(true);
  });

  it("keeps two hosts apart", async () => {
    await recordReaction("\u{1F680}", "a.test");
    expect(await getRecentReactions(1, "b.test")).not.toEqual(["\u{1F680}"]);
  });
});

describe("getRecentReactions", () => {
  it("puts the most recent first, like the desktop's recents row", async () => {
    await recordReaction("\u{1F680}", "gryt.test");
    await recordReaction("\u{1F680}", "gryt.test");
    await recordReaction("\u{1F389}", "gryt.test");

    expect(await getRecentReactions(2, "gryt.test")).toEqual(["\u{1F389}", "\u{1F680}"]);
  });

  it("pads out to the requested count with defaults", async () => {
    await recordReaction("\u{1F680}", "gryt.test");
    const recent = await getRecentReactions(6, "gryt.test");
    expect(recent).toHaveLength(6);
    expect(recent[0]).toBe("\u{1F680}");
  });

  it("never repeats a default already picked", async () => {
    await recordReaction("\u{1F44D}", "gryt.test");
    const recent = await getRecentReactions(6, "gryt.test");
    expect(recent.filter((r) => r === "\u{1F44D}")).toHaveLength(1);
  });
});
