import { describe, expect, it } from "vitest";

import { directConversationId, emptyKnowledge, installContactGuard, type FilteredEvent } from "./contactFilter";
import type { ContactPrefs } from "./contactPrefs";
import { confirmFriend, emptyBook, friendState, parseFriendList, reconcile, unconfirmed, watchFriendTraffic } from "./friendList";

/**
 * Friends as this phone knows them (GRYT-1471). The server's list can take a friend
 * away but can't add one you never agreed to, and the contact guard asks the phone.
 */

const at = new Date(0).toISOString();
const person = (id: string) => ({ serverUserId: id, nickname: id, at });
const list = ({ friends = [], incoming = [], outgoing = [] }: { friends?: string[]; incoming?: string[]; outgoing?: string[] } = {}) => ({
  friends: friends.map(person),
  incoming: incoming.map(person),
  outgoing: outgoing.map(person),
});

describe("reconcile", () => {
  it("won't add a friend the server made up, and shows it as unconfirmed", () => {
    const book = emptyBook();
    reconcile(book, list({ friends: ["stranger"] }), 1_000);
    expect(book.friends.size).toBe(0);
    expect(unconfirmed(book, list({ friends: ["stranger"] })).map((p) => p.serverUserId)).toEqual(["stranger"]);
    expect(friendState(book, list({ friends: ["stranger"] }), "stranger")).toBe("unconfirmed");
    confirmFriend(book, person("stranger"));
    expect(friendState(book, list({ friends: ["stranger"] }), "stranger")).toBe("friend");
  });

  it("adds somebody you asked once the server pairs you, and believes a removal", () => {
    const book = emptyBook();
    book.asked.set("pal", 1_000);
    reconcile(book, list({ outgoing: ["pal"] }), 2_000);
    expect(book.asked.has("pal")).toBe(true);
    reconcile(book, list({ friends: ["pal"] }), 3_000);
    expect(book.friends.has("pal")).toBe(true);
    reconcile(book, list(), 4_000);
    expect(book.friends.has("pal")).toBe(false);
  });

  it("keeps a fresh ask against a list that was already on its way", () => {
    const book = emptyBook();
    book.asked.set("new", 10_000);
    reconcile(book, list(), 20_000);
    expect(book.asked.has("new")).toBe(true);
    reconcile(book, list(), 50_000);
    expect(book.asked.has("new")).toBe(false);
  });

  it("reads anything malformed as empty", () => {
    expect(parseFriendList("nope")).toBeNull();
    expect(parseFriendList({ friends: [{ x: 1 }] })).toEqual({ friends: [], incoming: [], outgoing: [] });
  });
});

const ME = "me";
const ringFrom = (from: string) => ({
  conversation_id: directConversationId(ME, from),
  from: { server_user_id: from, nickname: from },
  expires_at: Date.now() + 30_000,
});

/** A hostile server as far as the guard and the watcher see it. */
function hostile(prefs: ContactPrefs) {
  const surfaced: { event: string; payload: unknown }[] = [];
  const sent: [string, unknown][] = [];
  const socket = {
    onevent(packet: { data?: unknown[] }) {
      const [event, payload] = packet.data ?? [];
      surfaced.push({ event: String(event), payload });
    },
    emit(event: string, ...args: unknown[]) {
      sent.push([event, args[0]]);
      return socket;
    },
  };
  const book = emptyBook();
  const filtered: FilteredEvent[] = [];
  installContactGuard(socket, {
    host: "hostile.example",
    selfId: () => ME,
    prefs: () => prefs,
    knowledge: emptyKnowledge(),
    persist: () => {},
    onFiltered: (e) => filtered.push(e),
    friends: { isFriend: (id) => book.friends.has(id), hasAny: () => book.friends.size > 0 },
  });
  watchFriendTraffic(socket, { book, prefs: () => prefs, persist: () => {} });
  return {
    push: (event: string, payload: unknown) => socket.onevent({ data: [event, payload] }),
    emit: (event: string, payload: unknown) => socket.emit(event, payload),
    rings: () => surfaced.filter((s) => s.event === "call:incoming").map((s) => (s.payload as { from: { server_user_id: string } }).from.server_user_id),
    of: (event: string) => surfaced.filter((s) => s.event === event),
    filtered,
    book,
  };
}

describe("against a server that claims a friendship", () => {
  it("drops the ring of a friend this phone never agreed to", () => {
    const s = hostile({ messages: "everyone", calls: "friends" });
    s.push("friend:list", list({ friends: ["stranger"] }));
    s.push("call:incoming", ringFrom("stranger"));
    expect(s.rings()).toEqual([]);
    expect(s.filtered.map((f) => [f.kind, f.fromId, f.reason])).toEqual([["call", "stranger", "setting"]]);
  });

  it("lets a friend you asked ring, and forgets them the moment you remove them", () => {
    const s = hostile({ messages: "everyone", calls: "friends" });
    s.emit("friend:request", { accessToken: "t", serverUserId: "pal" });
    s.push("friend:list", list({ friends: ["pal"] }));
    s.push("call:incoming", ringFrom("pal"));
    expect(s.rings()).toEqual(["pal"]);
    s.emit("friend:remove", { accessToken: "t", serverUserId: "pal" });
    s.push("call:incoming", ringFrom("pal"));
    expect(s.rings()).toEqual(["pal"]);
  });

  it("holds back a request notice when messages are set to nobody", () => {
    const prefs: ContactPrefs = { messages: "nobody", calls: "nobody" };
    const s = hostile(prefs);
    s.push("friend:request:incoming", { serverUserId: "asker" });
    expect(s.of("friend:request:incoming")).toHaveLength(0);
    prefs.messages = "everyone";
    s.push("friend:request:incoming", { serverUserId: "asker" });
    expect(s.of("friend:request:incoming")).toHaveLength(1);
  });
});
