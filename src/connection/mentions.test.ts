import { describe, expect, it } from "vitest";

import {
  addMention,
  addThreadMention,
  applyCounts,
  applyThreadCounts,
  countMentionRows,
  countThreadMentionRows,
  clearMentions,
  clearThreadMentions,
  clearTimelineMentions,
  threadMentionsIn,
  totalFor,
  type MentionsByHost,
} from "./mentions";

const HOST = "community.gryt.chat";
const OTHER = "gryt.example";

describe("mention counts", () => {
  it("takes what the server says", () => {
    const all = applyCounts({}, HOST, { general: 2, help: 1 });
    expect(all[HOST]).toEqual({ general: 2, help: 1 });
  });

  it("replaces rather than merges", () => {
    // The case this exists for: read on a desktop while the phone was asleep.
    // Merging would leave a badge on #help that nothing here can clear.
    let all = applyCounts({}, HOST, { general: 2, help: 1 });
    all = applyCounts(all, HOST, { general: 2 });
    expect(all[HOST]).toEqual({ general: 2 });
  });

  it("treats a zero as an absence", () => {
    const all = applyCounts({}, HOST, { general: 0 });
    expect(all[HOST]).toBeUndefined();
  });

  it("drops the server when nothing is left", () => {
    let all = applyCounts({}, HOST, { general: 1 });
    all = applyCounts(all, HOST, {});
    expect(HOST in all).toBe(false);
  });

  it("counts one more while connected", () => {
    let all = applyCounts({}, HOST, { general: 1 });
    all = addMention(all, HOST, "general");
    all = addMention(all, HOST, "random");
    expect(all[HOST]).toEqual({ general: 2, random: 1 });
  });

  it("keeps servers apart", () => {
    let all = addMention({}, HOST, "general");
    all = addMention(all, OTHER, "general");
    expect(all[HOST].general).toBe(1);
    expect(all[OTHER].general).toBe(1);
  });

  it("clears one conversation and leaves the rest", () => {
    let all = applyCounts({}, HOST, { general: 2, help: 1 });
    all = clearMentions(all, HOST, "general");
    expect(all[HOST]).toEqual({ help: 1 });
  });

  it("forgets the server once its last one is read", () => {
    let all = applyCounts({}, HOST, { general: 2 });
    all = clearMentions(all, HOST, "general");
    expect(HOST in all).toBe(false);
  });

  it("does nothing when there is nothing to clear", () => {
    const all: MentionsByHost = applyCounts({}, HOST, { general: 1 });
    // Same object back, so a React state update is skipped rather than
    // re-rendering every channel row for a tap that changed nothing.
    expect(clearMentions(all, HOST, "random")).toBe(all);
    expect(clearMentions(all, OTHER, "general")).toBe(all);
  });

  it("adds up one server's", () => {
    const all = applyCounts({}, HOST, { general: 2, help: 1 });
    expect(totalFor(all, HOST)).toBe(3);
    expect(totalFor(all, OTHER)).toBe(0);
  });
});

describe("countMentionRows (GRYT-1455)", () => {
  const rows = [
    { conversation_id: "general", kind: "everyone" },
    { conversation_id: "general", kind: "role" },
    { conversation_id: "random", kind: "here" },
    { conversation_id: "random", kind: "user" },
  ];

  it("counts every row when nothing is suppressed", () => {
    expect(countMentionRows(rows, false)).toEqual({ general: 2, random: 2 });
  });

  it("drops @everyone and @here, and only those, while suppressed", () => {
    expect(countMentionRows(rows, true)).toEqual({ general: 1, random: 1 });
  });
});

describe("mentions inside a thread", () => {
  const rows = [
    { conversation_id: "room", thread_id: "t1", kind: "user" },
    { conversation_id: "room", thread_id: "t1", kind: "everyone" },
    { conversation_id: "room", thread_id: null, kind: "user" },
    { conversation_id: "help", thread_id: "t2", kind: "user" },
  ];

  it("counts per thread, with the channel each hangs off", () => {
    expect(countThreadMentionRows(rows, false)).toEqual({
      t1: { conversationId: "room", count: 2 },
      t2: { conversationId: "help", count: 1 },
    });
    // Suppress takes @everyone out of the thread's count as it does the channel's.
    expect(countThreadMentionRows(rows, true).t1.count).toBe(1);
  });

  it("counts once on the channel as well as on the thread", () => {
    const channels = applyCounts({}, HOST, countMentionRows(rows, false));
    const threads = applyThreadCounts({}, HOST, countThreadMentionRows(rows, false));
    expect(channels[HOST].room).toBe(3);
    expect(threadMentionsIn(threads, HOST, "room")).toBe(2);
  });

  it("leaves the thread part on the channel when the channel is opened", () => {
    // Standing in the channel reads its timeline, not the threads hanging off it.
    const all: MentionsByHost = { [HOST]: { room: 3 } };
    expect(clearTimelineMentions(all, HOST, "room", 2)[HOST]).toEqual({ room: 2 });
    expect(clearTimelineMentions(all, HOST, "room", 0)[HOST]).toBeUndefined();
    const settled: MentionsByHost = { [HOST]: { room: 2 } };
    expect(clearTimelineMentions(settled, HOST, "room", 2)).toBe(settled);
  });

  it("is read by opening the thread", () => {
    let threads = addThreadMention({}, HOST, "room", "t1");
    threads = addThreadMention(threads, HOST, "room", "t1");
    expect(threads[HOST].t1.count).toBe(2);
    threads = clearThreadMentions(threads, HOST, "t1");
    expect(threads[HOST]).toBeUndefined();
  });
});
