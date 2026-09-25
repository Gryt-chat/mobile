import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createFloodLimiter,
  directConversationId,
  emptyKnowledge,
  FLOOD_LIMIT,
  installContactGuard,
  type FilteredEvent,
} from "./contactFilter";
import { resolveContactPrefs, parseStoredContactPrefs, type ContactPrefs } from "./contactPrefs";

/**
 * The phone's own check on who may message or ring you (GRYT-1470). A fake server
 * that ignores your settings pushes events, and only what passes reaches a listener.
 */

const ME = "me";
const FRIEND = "friend";
const pair = (other: string) => directConversationId(ME, other);

const message = (from: string, conversationId = pair(from)) => ({
  message_id: `m-${Math.random()}`,
  conversation_id: conversationId,
  sender_server_id: from,
  sender_nickname: from,
  text: "hi",
});
const ringFrom = (from: string, conversationId = pair(from)) => ({
  conversation_id: conversationId,
  from: { server_user_id: from, nickname: from },
  expires_at: Date.now() + 30_000,
});
const view = (other: string) => ({
  conversation_id: pair(other),
  kind: "dm",
  members: [{ server_user_id: other, nickname: other }],
  other: { server_user_id: other, nickname: other },
});

/** A socket as far as the guard sees it: packets in through onevent, emits out. */
function hostile(prefs: ContactPrefs) {
  const surfaced: { event: string; payload: unknown }[] = [];
  const sent: string[] = [];
  const socket = {
    onevent(packet: { data?: unknown[] }) {
      const [event, payload] = packet.data ?? [];
      surfaced.push({ event: String(event), payload });
    },
    emit(event: string, ..._args: unknown[]) {
      sent.push(event);
      return socket;
    },
  };
  const filtered: FilteredEvent[] = [];
  const knowledge = emptyKnowledge();
  installContactGuard(socket, {
    host: "hostile.example",
    selfId: () => ME,
    prefs: () => prefs,
    knowledge,
    persist: () => {},
    onFiltered: (e) => filtered.push(e),
  });
  return {
    push: (event: string, payload: unknown) => socket.onevent({ data: [event, payload] }),
    emit: (event: string, payload: unknown) => socket.emit(event, payload),
    of: (event: string) => surfaced.filter((s) => s.event === event),
    filtered,
    knowledge,
    sent,
  };
}

describe("the pair id", () => {
  it("matches the server's directConversationId", () => {
    const server = `dm_${createHash("sha256").update(["alice", "bob"].sort().join("\0")).digest("hex").slice(0, 32)}`;
    expect(directConversationId("bob", "alice")).toBe(server);
  });
});

describe("installContactGuard against a hostile server", () => {
  it("drops a DM, a new conversation and a ring the settings refuse, and counts them", () => {
    const s = hostile({ messages: "nobody", calls: "nobody" });
    s.push("dm:opened", view("stranger"));
    s.push("chat:new", message("stranger"));
    s.push("call:incoming", ringFrom("stranger"));
    expect(s.of("dm:opened")).toHaveLength(0);
    expect(s.of("chat:new")).toHaveLength(0);
    expect(s.of("call:incoming")).toHaveLength(0);
    expect(s.filtered.map((f) => f.kind).sort()).toEqual(["call", "conversation", "message"]);
    expect(s.filtered.every((f) => f.reason === "setting")).toBe(true);
  });

  it("by default lets messages from anyone through and rings only friends", () => {
    const s = hostile({ messages: "everyone", calls: "friends" });
    s.push("dm:list", { items: [view(FRIEND)] });
    expect(s.knowledge.friends.has(FRIEND)).toBe(true);

    s.push("call:incoming", ringFrom("stranger"));
    s.push("chat:new", message("stranger"));
    s.push("call:incoming", ringFrom(FRIEND));
    expect(s.of("call:incoming").map((r) => (r.payload as { from: { server_user_id: string } }).from.server_user_id)).toEqual([FRIEND]);
    expect(s.of("chat:new")).toHaveLength(1);
  });

  it("makes somebody a friend once you write to them, on this phone", () => {
    const s = hostile({ messages: "everyone", calls: "friends" });
    s.push("dm:opened", view("stranger"));
    s.emit("chat:send", { conversationId: pair("stranger"), text: "hello back" });
    s.push("call:incoming", ringFrom("stranger"));
    expect(s.of("call:incoming")).toHaveLength(1);
  });

  it("closes a conversation already open when the setting gets stricter", () => {
    const prefs: ContactPrefs = { messages: "everyone", calls: "everyone" };
    const s = hostile(prefs);
    s.push("chat:new", message("chatty"));
    prefs.messages = "friends";
    s.push("chat:new", message("chatty"));
    expect(s.of("chat:new")).toHaveLength(1);
    expect(s.filtered.at(-1)?.reason).toBe("setting");
  });

  it(`stops a flood after ${FLOOD_LIMIT} new conversations, whatever the settings`, () => {
    const s = hostile({ messages: "everyone", calls: "everyone" });
    for (let i = 0; i < 20; i++) s.push("chat:new", message(`spammer-${i}`));
    expect(s.of("chat:new")).toHaveLength(FLOOD_LIMIT);
    expect(s.filtered.every((f) => f.reason === "flood")).toBe(true);
  });

  it("counts conversations, not messages, so one busy conversation isn't a flood", () => {
    const s = hostile({ messages: "everyone", calls: "everyone" });
    for (let i = 0; i < 12; i++) s.push("chat:new", message("talkative"));
    expect(s.of("chat:new")).toHaveLength(12);
  });

  it("refuses a one-to-one whose id isn't the pair's", () => {
    const s = hostile({ messages: "everyone", calls: "everyone" });
    s.push("dm:opened", { ...view(FRIEND), conversation_id: "dm_0000000000000000000000000000beef" });
    expect(s.of("dm:opened")).toHaveLength(0);
    expect(s.filtered[0]?.reason).toBe("mismatch");
  });

  it("still opens a conversation you asked for", () => {
    const s = hostile({ messages: "nobody", calls: "nobody" });
    s.emit("dm:open", { targetServerUserId: "someone" });
    s.push("dm:opened", view("someone"));
    expect(s.of("dm:opened")).toHaveLength(1);
  });

  it("drops a held-back conversation from a later list, and keeps it once you let it in", () => {
    const s = hostile({ messages: "nobody", calls: "nobody" });
    s.push("dm:list", { items: [view(FRIEND)] });
    s.push("dm:list", { items: [view(FRIEND), view("stranger")] });
    const ids = (s.of("dm:list").at(-1)?.payload as { items: { conversation_id: string }[] }).items.map((i) => i.conversation_id);
    expect(ids).toEqual([pair(FRIEND)]);
    expect(s.filtered.at(-1)?.kind).toBe("conversation");

    s.knowledge.known.add(pair("stranger"));
    s.push("dm:list", { items: [view(FRIEND), view("stranger")] });
    expect((s.of("dm:list").at(-1)?.payload as { items: unknown[] }).items).toHaveLength(2);
  });

  it("leaves channels alone", () => {
    const s = hostile({ messages: "nobody", calls: "nobody" });
    s.push("chat:new", message("anyone", "general"));
    expect(s.of("chat:new")).toHaveLength(1);
  });
});

describe("createFloodLimiter", () => {
  it("slides its window", () => {
    const limiter = createFloodLimiter(2, 1000);
    expect([limiter.admit(0), limiter.admit(10), limiter.admit(20), limiter.admit(1_011)]).toEqual([true, true, false, true]);
  });
});

describe("resolveContactPrefs", () => {
  it("uses a server's own answer over the global one, and never lets calls be looser", () => {
    const stored = parseStoredContactPrefs({
      global: { messages: "everyone", calls: "everyone" },
      servers: { "big.example": { messages: "nobody" }, junk: { messages: "maybe" } },
    });
    expect(resolveContactPrefs(stored, "big.example")).toEqual({ messages: "nobody", calls: "nobody" });
    expect(resolveContactPrefs(stored, "other.example")).toEqual({ messages: "everyone", calls: "everyone" });
    expect(stored.servers.junk).toBeUndefined();
  });

  it("reads the defaults from nothing: messages from anyone, calls from friends", () => {
    expect(resolveContactPrefs(parseStoredContactPrefs(null), "x")).toEqual({ messages: "everyone", calls: "friends" });
  });
});
