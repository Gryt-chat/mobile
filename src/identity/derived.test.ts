import { describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, v: string) => void disk.set(k, v),
  },
}));

const { fromSeed, publicFromSeed } = await import("./derived");

const seedA = new Uint8Array(32).fill(1);
const seedB = new Uint8Array(32).fill(2);

describe("derived", () => {
  it("derives once per seed and scope", () => {
    const derive = vi.fn(() => ({ n: Math.random() }));
    const first = fromSeed("pair", seedA, "srv:a", derive);
    expect(fromSeed("pair", seedA, "srv:a", derive)).toBe(first);
    expect(fromSeed("pair", seedA, "srv:b", derive)).not.toBe(first);
    expect(fromSeed("pair", seedB, "srv:a", derive)).not.toBe(first);
    expect(derive).toHaveBeenCalledTimes(3);
  });

  it("keeps a public value on disk, and never a different seed's", async () => {
    await publicFromSeed("binding", seedA, "srv:a", () => "from A");
    await Promise.resolve();
    expect([...disk.values()]).toEqual(["from A"]);
    expect([...disk.keys()].some((k) => k.includes(String.fromCharCode(1)))).toBe(false);
    expect(await publicFromSeed("binding", seedB, "srv:a", () => "from B")).toBe("from B");
  });
});
