import { describe, expect, it } from "vitest";

import type { ThreadSummary } from "../connection/types";
import {
  applyUpdate,
  filterCounts,
  goneFromError,
  matchesFilter,
  maySetStatus,
  mergeSummaries,
  relativeTime,
  removeSummary,
  repliesLabel,
  shownTopics,
  takesReplies,
  topicFromWire,
  type ForumTopic,
} from "./threads";

function summary(over: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    thread_id: "t1",
    conversation_id: "general",
    root_message_id: "m1",
    title: null,
    status: "open",
    reply_count: 0,
    last_message_at: "2026-09-28T10:00:00.000Z",
    created_by: "alice",
    ...over,
  };
}

function topic(over: Partial<ForumTopic> = {}): ForumTopic {
  return {
    ...summary(),
    participant_count: 1,
    creator_nickname: "Alice",
    preview: null,
    tags: [],
    ...over,
  };
}

describe("thread summaries", () => {
  it("keeps a reply count that came with the channel's history", () => {
    // What a reload reads: nobody watched the thread:created arrive.
    const held = mergeSummaries({}, [summary({ reply_count: 1 })]);
    expect(held.m1.reply_count).toBe(1);
  });

  it("keeps what an earlier page brought when a later one arrives", () => {
    let held = mergeSummaries({}, [summary()]);
    held = mergeSummaries(held, [summary({ thread_id: "t2", root_message_id: "m2" })]);
    expect(Object.keys(held).sort()).toEqual(["m1", "m2"]);
  });

  it("merges an update rather than replacing, so the title survives a reply", () => {
    let held = mergeSummaries({}, [summary({ title: "Crash on launch" })]);
    held = applyUpdate(held, {
      conversation_id: "general",
      thread_id: "t1",
      root_message_id: "m1",
      reply_count: 2,
    });
    expect(held.m1).toMatchObject({ title: "Crash on launch", reply_count: 2 });
  });

  it("drops a deleted thread and leaves the rest", () => {
    let held = mergeSummaries({}, [summary(), summary({ thread_id: "t2", root_message_id: "m2" })]);
    held = removeSummary(held, "m1");
    expect(Object.keys(held)).toEqual(["m2"]);
    expect(removeSummary(held, "nope")).toBe(held);
  });

  it("says reply and replies", () => {
    expect(repliesLabel(1)).toBe("1 reply");
    expect(repliesLabel(0)).toBe("0 replies");
    expect(repliesLabel(12)).toBe("12 replies");
  });
});

describe("what a thread takes", () => {
  it("takes no reply once it is closed or locked, the same check chat:send makes", () => {
    expect(takesReplies({ status: "open" })).toBe(true);
    expect(takesReplies({ status: "solved" })).toBe(true);
    expect(takesReplies({ status: "closed" })).toBe(false);
    expect(takesReplies({ status: "open", locked: true })).toBe(false);
  });

  it("offers the status to the author and a moderator, and nobody else", () => {
    const thread = summary({ created_by: "alice" });
    expect(maySetStatus(thread, "alice", false)).toBe(true);
    expect(maySetStatus(thread, "bob", true)).toBe(true);
    expect(maySetStatus(thread, "bob", false)).toBe(false);
    expect(maySetStatus(thread, null, false)).toBe(false);
  });

  it("reads a missing thread off the error code, and nothing else as gone", () => {
    expect(goneFromError({ error: "thread_not_found", message: "That thread no longer exists." })).toBe("missing");
    expect(goneFromError({ error: "forbidden" })).toBeNull();
    expect(goneFromError("Failed to fetch thread")).toBeNull();
  });
});

describe("forum filters", () => {
  const topics = [
    topic({ thread_id: "open", created_by: "alice" }),
    topic({ thread_id: "answered", reply_count: 3, created_by: "bob" }),
    topic({ thread_id: "solved", status: "solved", created_by: "bob" }),
    topic({ thread_id: "closed", status: "closed", reply_count: 1, created_by: "alice" }),
  ];

  it("leaves a closed topic out of All, and Closed is the way back to it", () => {
    const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
      topics.filter((t) => matchesFilter(t, filter, "alice")).map((t) => t.thread_id);
    expect(ids("all")).toEqual(["open", "answered", "solved"]);
    expect(ids("closed")).toEqual(["closed"]);
  });

  it("counts a solved topic as answered even with no replies", () => {
    expect(filterCounts(topics, "alice")).toEqual({ all: 3, unanswered: 1, solved: 1, closed: 1, mine: 2 });
  });

  it("has no Mine for somebody the server has not named", () => {
    expect(filterCounts(topics, null).mine).toBe(0);
  });

  it("narrows by tags on top of the filter, any one of them matching", () => {
    const tagged = [
      topic({ thread_id: "bug", tags: ["bug"] }),
      topic({ thread_id: "idea", tags: ["idea"] }),
      topic({ thread_id: "both", tags: ["bug", "idea"], status: "closed" }),
    ];
    expect(shownTopics(tagged, "all", null, new Set(["bug"])).map((t) => t.thread_id)).toEqual(["bug"]);
    expect(shownTopics(tagged, "all", null, new Set()).map((t) => t.thread_id)).toEqual(["bug", "idea"]);
    expect(shownTopics(tagged, "closed", null, new Set(["idea"])).map((t) => t.thread_id)).toEqual(["both"]);
  });

  it("takes the author from creator_server_id when the row does not name one", () => {
    const row = topicFromWire({ ...topic(), created_by: undefined, creator_server_id: "carol", tags: undefined });
    expect(row.created_by).toBe("carol");
    expect(row.tags).toEqual([]);
  });
});

describe("relative time", () => {
  const now = Date.parse("2026-09-28T12:00:00.000Z");
  it("uses the desktop's words", () => {
    expect(relativeTime("2026-09-28T11:59:30.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-28T11:55:00.000Z", now)).toBe("5m");
    expect(relativeTime("2026-09-28T09:00:00.000Z", now)).toBe("3h");
    expect(relativeTime("2026-09-27T11:00:00.000Z", now)).toBe("yesterday");
    expect(relativeTime("2026-09-24T12:00:00.000Z", now)).toBe("4d");
    expect(relativeTime("not a date", now)).toBe("");
  });
});
