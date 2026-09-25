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

const store = await import("./friendsStore");

/** The phone's own friends book (GRYT-1471): kept on this phone, and nowhere else. */
describe("friendsStore", () => {
  it("keeps the book per server on this phone", async () => {
    await store.friendsLoaded;
    const book = store.friendBookFor("a.example");
    book.friends.set("pal", { nickname: "Pal", since: 1 });
    book.asked.set("new", 5);
    store.persistFriendBook("a.example");
    const saved = JSON.parse(disk.get("gryt:friends") ?? "{}");
    expect(Object.keys(saved)).toEqual(["a.example"]);
    expect(saved["a.example"].asked).toEqual({ new: 5 });
    expect(store.friendGateFor("a.example").isFriend("pal")).toBe(true);
    expect(store.friendGateFor("b.example").hasAny()).toBe(false);
  });

  it("announces a request once", () => {
    expect(store.firstNoticeOf("a.example", "asker")).toBe(true);
    expect(store.firstNoticeOf("a.example", "asker")).toBe(false);
  });

  it("says nothing about a server that never sent a list", () => {
    expect(store.friendStateOf("c.example", "x")).toBeNull();
    store.setServerFriendList("c.example", { friends: [], incoming: [{ serverUserId: "x", nickname: "X", at: "" }], outgoing: [] });
    expect(store.friendStateOf("c.example", "x")).toBe("incoming");
    expect(store.friendsOf("c.example")?.incoming).toHaveLength(1);
  });
});
