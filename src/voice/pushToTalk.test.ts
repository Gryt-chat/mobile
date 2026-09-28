import { describe, expect, it, vi } from "vitest";

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

const store = await import("./pushToTalk");

describe("pushToTalk store", () => {
  it("ignores a press while the setting is off", async () => {
    await store.pushToTalkLoaded;
    store.setTalkHeld(true);
    expect(store.getPushToTalk()).toEqual({ enabled: false, held: false });
  });

  it("keeps the setting on the phone and never the held state", async () => {
    store.setPushToTalkEnabled(true);
    store.setTalkHeld(true);
    expect(store.getPushToTalk()).toEqual({ enabled: true, held: true });
    await Promise.resolve();
    expect(JSON.parse(disk.get("gryt:pushToTalk") ?? "{}")).toEqual({ enabled: true });
  });

  it("closes the button when the setting goes off", () => {
    store.setPushToTalkEnabled(false);
    expect(store.getPushToTalk().held).toBe(false);
  });
});
