import { describe, expect, it } from "vitest";

import type { ThreadSummary } from "../connection/types";
import {
  applyUpdate,
  goneFromError,
  maySetStatus,
  mergeSummaries,
  removeSummary,
  repliesLabel,
  takesReplies,
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
