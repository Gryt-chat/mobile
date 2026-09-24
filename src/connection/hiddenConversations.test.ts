import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectConversation } from "./directMessages";

/**
 * The device-local store behind hiding a conversation (GRYT-1379, GRYT-1381).
 * `AsyncStorage` stands in for the desktop's `localStorage`.
 */

const disk = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    async getItem(key: string) {
      return disk.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      disk.set(key, value);
    },
    async removeItem(key: string) {
      disk.delete(key);
    },
  },
}));

const {
  hideConversation,
  isBackFromHiding,
  resetHiddenConversations,
  showConversation,
  splitHidden,
} = await import("./hiddenConversations");

function conversation(over: Partial<DirectConversation> & { conversation_id: string }): DirectConversation {
  return {
    kind: "dm",
    name: null,
    icon_file_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    last_message_at: null,
    members: [],
    other: { server_user_id: "them", nickname: "Them", avatar_file_id: null, avatar_worn: null },
    ...over,
  };
}

beforeEach(() => {
  disk.clear();
  resetHiddenConversations();
});

describe("hideConversation and showConversation", () => {
  it("round-trips through storage", async () => {
    hideConversation("gryt.test", "me", "dm_1", 1000);
    // A microtask away: the write is fire-and-forget, so give it a tick.
    await Promise.resolve();
    const raw = disk.get("gryt:hiddenConversations:gryt.test:me");
    expect(raw && JSON.parse(raw)).toEqual({ dm_1: 1000 });
  });

  it("does nothing to put back one that was never hidden", async () => {
    showConversation("gryt.test", "me", "dm_1");
    await Promise.resolve();
    expect(disk.has("gryt:hiddenConversations:gryt.test:me")).toBe(false);
  });

  it("clears the storage entry once nothing is hidden", async () => {
    hideConversation("gryt.test", "me", "dm_1", 1000);
    showConversation("gryt.test", "me", "dm_1");
    await Promise.resolve();
    expect(disk.has("gryt:hiddenConversations:gryt.test:me")).toBe(false);
  });

  it("keeps two accounts on the same device apart", async () => {
    hideConversation("gryt.test", "me", "dm_1", 1000);
    hideConversation("gryt.test", "someone-else", "dm_2", 1000);
    await Promise.resolve();
    expect(disk.has("gryt:hiddenConversations:gryt.test:me")).toBe(true);
    expect(JSON.parse(disk.get("gryt:hiddenConversations:gryt.test:me")!)).toEqual({ dm_1: 1000 });
  });
});

describe("isBackFromHiding", () => {
  it("is false with no last message", () => {
    expect(isBackFromHiding(1000, null)).toBe(false);
    expect(isBackFromHiding(1000, undefined)).toBe(false);
  });

  it("is true once a message arrives after the hide", () => {
    const at = Date.parse("2026-09-01T00:00:10.000Z");
    expect(isBackFromHiding(Date.parse("2026-09-01T00:00:00.000Z"), new Date(at).toISOString())).toBe(true);
  });

  it("is false for a message from before the hide", () => {
    const at = Date.parse("2026-09-01T00:00:00.000Z");
    expect(isBackFromHiding(Date.parse("2026-09-01T00:00:10.000Z"), new Date(at).toISOString())).toBe(false);
  });

  it("is false for an unparsable date", () => {
    expect(isBackFromHiding(1000, "not-a-date")).toBe(false);
  });
});

describe("splitHidden", () => {
  it("lists everything when nothing is hidden", () => {
    const a = conversation({ conversation_id: "dm_1" });
    const b = conversation({ conversation_id: "dm_2" });
    const split = splitHidden([a, b], {});
    expect(split.listed).toEqual([a, b]);
    expect(split.hidden).toEqual([]);
    expect(split.returned).toEqual([]);
  });

  it("moves a hidden conversation out of the listed rows", () => {
    const a = conversation({ conversation_id: "dm_1" });
    const b = conversation({ conversation_id: "dm_2" });
    const split = splitHidden([a, b], { dm_1: 1000 });
    expect(split.listed).toEqual([b]);
    expect(split.hidden).toEqual([a]);
    expect(split.returned).toEqual([]);
  });

  it("keeps a returned conversation listed and flags it for forgetting", () => {
    const a = conversation({
      conversation_id: "dm_1",
      last_message_at: "2026-09-01T00:00:10.000Z",
    });
    const split = splitHidden([a], { dm_1: Date.parse("2026-09-01T00:00:00.000Z") });
    expect(split.listed).toEqual([a]);
    expect(split.hidden).toEqual([]);
    expect(split.returned).toEqual([a]);
  });
});
