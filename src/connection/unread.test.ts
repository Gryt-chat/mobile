import { describe, expect, it, vi } from "vitest";

import {
  bump,
  clearConversation,
  clearServer,
  closeConversation,
  firstUnreadIndex,
  markUnread,
  openConversation,
  readConversation,
  readServer,
  serverTotal,
  type UnreadCounts,
} from "./unread";

const HOST = "community.gryt.chat";
const OTHER = "gryt.example";

describe("unread counts", () => {
  it("counts per conversation and adds a server up", () => {
    let all: UnreadCounts = {};
    all = bump(all, HOST, "general");
    all = bump(all, HOST, "general");
    all = bump(all, HOST, "help");
    all = bump(all, OTHER, "general");
    expect(all[HOST]).toEqual({ general: 2, help: 1 });
    expect(serverTotal(all, HOST)).toBe(3);
    expect(serverTotal(all, "nowhere")).toBe(0);
  });

  it("reads one conversation and leaves the rest of the server", () => {
    const all: UnreadCounts = { [HOST]: { general: 2, help: 1 } };
    expect(clearConversation(all, HOST, "general")).toEqual({ [HOST]: { help: 1 } });
    // The last one read takes the server off the list, so its tile has no badge.
    expect(clearConversation({ [HOST]: { help: 1 } }, HOST, "help")).toEqual({});
    expect(clearConversation(all, HOST, "quiet")).toBe(all);
  });

  it("reads a whole server and leaves the others", () => {
    const all: UnreadCounts = { [HOST]: { general: 2 }, [OTHER]: { general: 1 } };
    expect(clearServer(all, HOST)).toEqual({ [OTHER]: { general: 1 } });
    expect(clearServer(all, "nowhere")).toBe(all);
  });
});

describe("the conversation on screen", () => {
  it("hands back what was waiting when opened, and counts nothing while open", () => {
    markUnread(HOST, "room");
    markUnread(HOST, "room");
    expect(openConversation(HOST, "room")).toBe(2);

    markUnread(HOST, "room");
    expect(openConversation(HOST, "room")).toBe(0);

    closeConversation(HOST, "room");
    markUnread(HOST, "room");
    expect(openConversation(HOST, "room")).toBe(1);
    closeConversation(HOST, "room");
  });

  it("only closes the one still open", () => {
    openConversation(HOST, "a");
    openConversation(HOST, "b");
    // "a" losing focus after "b" took it must not start counting "b".
    closeConversation(HOST, "a");
    markUnread(HOST, "b");
    expect(openConversation(HOST, "b")).toBe(0);
    closeConversation(HOST, "b");
  });
});

describe("mark as read", () => {
  it("tells the server to clear a conversation's mentions, threads and all", () => {
    const emit = vi.fn();
    markUnread(HOST, "help");
    readConversation({ emit }, HOST, "help");
    expect(emit).toHaveBeenCalledWith("mentions:seen", { conversationId: "help", includeThreads: true });
    expect(openConversation(HOST, "help")).toBe(0);
    closeConversation(HOST, "help");
  });

  it("clears a whole server with no conversation named", () => {
    const emit = vi.fn();
    markUnread(OTHER, "general");
    markUnread(OTHER, "random");
    readServer({ emit }, OTHER);
    expect(emit).toHaveBeenCalledWith("mentions:seen", {});
    expect(openConversation(OTHER, "general")).toBe(0);
    expect(openConversation(OTHER, "random")).toBe(0);
    closeConversation(OTHER, "random");
  });
});

describe("the first unread message", () => {
  const theirs = (id: string) => ({ id, sender_server_id: "bob" });
  const mine = (id: string) => ({ id, sender_server_id: "me" });

  it("is the countth newest message somebody else wrote", () => {
    const newestFirst = [theirs("c"), mine("reply"), theirs("b"), theirs("a"), theirs("old")];
    expect(firstUnreadIndex(newestFirst, 3, "me")).toBe(3);
  });

  it("skips system lines and drafts, which were never counted", () => {
    const newestFirst = [
      { id: "d", sender_server_id: "me", pending: true },
      { id: "s", sender_server_id: "system", system: true },
      theirs("a"),
    ];
    expect(firstUnreadIndex(newestFirst, 1, "me")).toBe(2);
  });

  it("is nothing when the page does not reach back that far, or nothing is waiting", () => {
    expect(firstUnreadIndex([theirs("a")], 2, "me")).toBeNull();
    expect(firstUnreadIndex([theirs("a")], 0, "me")).toBeNull();
  });
});
