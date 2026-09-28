import { describe, expect, it } from "vitest";

import {
  closeConversation,
  markConversationRead,
  markUnread,
  openConversation,
  readConversation,
  readServer,
  serverTotal,
} from "../connection/unread";
import {
  bumpThread,
  clearServerThreads,
  clearThread,
  clearThreadsIn,
  closeThreadCount,
  markThreadUnread,
  openThreadCount,
  threadUnreadIn,
  threadUnreadSnapshot,
  unreadTarget,
  type ThreadUnreadCounts,
} from "./threadUnread";

const HOST = "community.gryt.chat";
const OTHER = "gryt.example";

describe("unread thread replies", () => {
  it("counts per thread and adds up per channel and per server", () => {
    let all: ThreadUnreadCounts = {};
    all = bumpThread(all, HOST, "room", "t1");
    all = bumpThread(all, HOST, "room", "t1");
    all = bumpThread(all, HOST, "room", "t2");
    all = bumpThread(all, HOST, "help", "t3");
    expect(threadUnreadIn(all, HOST, "room")).toBe(3);
    expect(threadUnreadIn(all, HOST)).toBe(4);
    expect(threadUnreadIn(all, OTHER)).toBe(0);
  });

  it("adds a thread's replies to the channel it hangs off, and standing in the channel leaves them", () => {
    // The desktop e2e case: a root on the timeline, then three replies under it.
    let threads: ThreadUnreadCounts = {};
    for (let i = 0; i < 3; i++) threads = bumpThread(threads, HOST, "room", "t1");
    markUnread(HOST, "room");
    expect(serverTotal({ [HOST]: { room: 1 } }, HOST) + threadUnreadIn(threads, HOST, "room")).toBe(4);
    // Opening the channel reads its timeline, not the threads hanging off it.
    expect(openConversation(HOST, "room")).toBe(1);
    closeConversation(HOST, "room");
    expect(threadUnreadIn(threads, HOST, "room")).toBe(3);
    markConversationRead(HOST, "room");
  });

  it("is read by opening the thread, one thread at a time", () => {
    let all: ThreadUnreadCounts = {};
    all = bumpThread(all, HOST, "room", "t1");
    all = bumpThread(all, HOST, "room", "t2");
    expect(clearThread(all, HOST, "t1")).toEqual({ [HOST]: { t2: { conversationId: "room", count: 1 } } });
    expect(clearThread(all, HOST, "nope")).toBe(all);
  });

  it("clears every thread in a channel, or on a server, for Mark as read", () => {
    let all: ThreadUnreadCounts = {};
    all = bumpThread(all, HOST, "room", "t1");
    all = bumpThread(all, HOST, "help", "t2");
    all = bumpThread(all, OTHER, "room", "t3");
    expect(threadUnreadIn(clearThreadsIn(all, HOST, "room"), HOST)).toBe(1);
    expect(clearServerThreads(all, HOST)).toEqual({ [OTHER]: all[OTHER] });
  });
});

describe("the thread store", () => {
  const count = (host: string, threadId: string) => threadUnreadSnapshot()[host]?.[threadId]?.count ?? 0;

  it("reads a thread when it opens, and counts nothing while it's on screen", () => {
    markThreadUnread(HOST, "room", "t1");
    markThreadUnread(HOST, "room", "t1");
    expect(count(HOST, "t1")).toBe(2);
    openThreadCount(HOST, "t1");
    expect(count(HOST, "t1")).toBe(0);
    markThreadUnread(HOST, "room", "t1");
    expect(count(HOST, "t1")).toBe(0);
    closeThreadCount(HOST, "t1");
    markThreadUnread(HOST, "room", "t1");
    expect(count(HOST, "t1")).toBe(1);
    openThreadCount(HOST, "t1");
    closeThreadCount(HOST, "t1");
  });

  it("only stops counting for the thread still open", () => {
    openThreadCount(HOST, "a");
    openThreadCount(HOST, "b");
    closeThreadCount(HOST, "a");
    markThreadUnread(HOST, "room", "b");
    expect(count(HOST, "b")).toBe(0);
    closeThreadCount(HOST, "b");
  });

  it("goes with Mark as read on the channel and on the server", () => {
    const emit = () => {};
    markThreadUnread(HOST, "room", "t9");
    markThreadUnread(HOST, "help", "t10");
    readConversation({ emit }, HOST, "room");
    expect(count(HOST, "t9")).toBe(0);
    expect(count(HOST, "t10")).toBe(1);
    markThreadUnread(OTHER, "room", "t8");
    readServer({ emit }, OTHER);
    expect(threadUnreadSnapshot()[OTHER]).toBeUndefined();
    readServer({ emit }, HOST);
  });
});

describe("where an arriving message counts", () => {
  const plain = { mine: false, system: false, muted: false };
  const reply = { sender_server_id: "bob", thread_id: "t1" };

  it("puts a thread reply on its thread and anything else on its conversation", () => {
    expect(unreadTarget(reply, plain)).toEqual({ thread: "t1" });
    expect(unreadTarget({ sender_server_id: "bob", thread_id: null }, plain)).toBe("conversation");
  });

  it("keeps a muted channel silent for thread replies too", () => {
    expect(unreadTarget(reply, { ...plain, muted: true })).toBeNull();
    expect(unreadTarget({ sender_server_id: "bob" }, { ...plain, muted: true })).toBeNull();
  });

  it("counts nothing of yours, and no system line", () => {
    expect(unreadTarget(reply, { ...plain, mine: true })).toBeNull();
    expect(unreadTarget(reply, { ...plain, system: true })).toBeNull();
  });
});
