import { describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, v: string) => void disk.set(k, v),
    getAllKeys: async () => [...disk.keys()],
    multiRemove: async (keys: string[]) => keys.forEach((k) => disk.delete(k)),
  },
}));

const { CACHED_PAGE, cachedPage, forgetServerPages, keepPage, pageToKeep, storedPage } = await import("./messageCache");

const msg = (id: string, extra = {}) => ({ conversation_id: "c", message_id: id, sender_server_id: "s", text: id, created_at: id, ...extra }) as never;

describe("messageCache", () => {
  it("keeps the newest page, without drafts, failures or sealed messages", () => {
    const many = Array.from({ length: CACHED_PAGE + 5 }, (_, i) => msg(String(i).padStart(3, "0")));
    const page = pageToKeep([...many, msg("p", { pending: true }), msg("f", { failed: true }), msg("x", { sealed: "env" })]);
    expect(page).toHaveLength(CACHED_PAGE);
    expect(page[0].message_id).toBe("005");
    expect(page.at(-1)?.message_id).toBe(String(CACHED_PAGE + 4).padStart(3, "0"));
  });

  it("answers from memory, from disk after a restart, and forgets a server you leave", async () => {
    keepPage("h", "c", [msg("1")], true);
    expect(cachedPage("h", "c")?.[0].message_id).toBe("1");
    await Promise.resolve();
    expect((await storedPage("h", "c"))?.[0].message_id).toBe("1");
    keepPage("other", "c", [msg("2")], true);
    await forgetServerPages("h");
    expect(cachedPage("h", "c")).toBeNull();
    expect(await storedPage("h", "c")).toBeNull();
    expect(cachedPage("other", "c")).not.toBeNull();
  });
});
