import { describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>([["gryt:voiceBitrateKbps", "128"]]);
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

const store = await import("./voiceQuality");

describe("voice quality", () => {
  it("loads what this phone saved", async () => {
    await store.voiceQualityLoaded;
    expect(store.getVoiceQuality()).toBe(128);
  });

  it("keeps it between 96 and 192, and 192 when unreadable", () => {
    expect(store.parseVoiceQuality("40")).toBe(96);
    expect(store.parseVoiceQuality("500")).toBe(192);
    expect(store.parseVoiceQuality("loud")).toBe(192);
    expect(store.parseVoiceQuality(null)).toBe(192);
    store.setVoiceQuality(300);
    expect(store.getVoiceQuality()).toBe(192);
    expect(disk.get("gryt:voiceBitrateKbps")).toBe("192");
  });
});
