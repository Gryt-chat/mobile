import { beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  disk.clear();
});

describe("recordReaction", () => {
  it("puts a first use at the front", async () => {
    await recordReaction("\u{1F680}", "gryt.test");
    expect(await getRecentReactions(1, "gryt.test")).toEqual(["\u{1F680}"]);
  });

  it("counts repeats rather than duplicating the entry", async () => {
    await recordReaction("\u{1F680}", "gryt.test");
    await recordReaction("\u{1F680}", "gryt.test");
    await recordReaction("\u{1F389}", "gryt.test");

    // Most-used wins the tie over most-recent, so the twice-picked one stays first.
    expect((await getRecentReactions(2, "gryt.test"))[0]).toBe("\u{1F680}");
  });

  it("keeps two hosts apart", async () => {
    await recordReaction("\u{1F680}", "a.test");
    expect(await getRecentReactions(1, "b.test")).not.toEqual(["\u{1F680}"]);
  });
});

describe("getRecentReactions", () => {
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
