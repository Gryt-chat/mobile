import { describe, expect, it } from "vitest";

import type { Message } from "../connection/types";
import { GROUP_WINDOW_MS, dayLabelFor, groupMessages } from "./messageGroups";

const NOW = new Date("2026-08-21T12:00:00Z");

function msg(iso: string, sender = "a", id = iso): Message {
  return {
    conversation_id: "c",
    message_id: id,
    sender_server_id: sender,
    text: "hi",
    created_at: iso,
  };
}

describe("dayLabelFor", () => {
  it("names today and yesterday", () => {
    expect(dayLabelFor("2026-08-21T09:00:00Z", NOW)).toBe("Today");
    expect(dayLabelFor("2026-08-20T09:00:00Z", NOW)).toBe("Yesterday");
  });

  it("uses the weekday inside the last week", () => {
    // Easier to place than a date when it is recent.
    expect(dayLabelFor("2026-08-18T09:00:00Z", NOW)).toMatch(/day$/);
  });

  it("falls back to a date further back", () => {
    expect(dayLabelFor("2026-07-01T09:00:00Z", NOW)).toMatch(/July|Jul/);
  });
});

describe("groupMessages", () => {
  it("heads the first message", () => {
    const [row] = groupMessages([msg("2026-08-21T10:00:00Z")], NOW);
    expect(row.showHeader).toBe(true);
    expect(row.dayLabel).toBe("Today");
  });

  it("continues a run from the same person", () => {
    const rows = groupMessages(
      [msg("2026-08-21T10:00:00Z", "a", "1"), msg("2026-08-21T10:01:00Z", "a", "2")],
      NOW,
    );
    expect(rows[1].showHeader).toBe(false);
    expect(rows[1].dayLabel).toBeNull();
  });

  it("breaks the run when somebody else speaks", () => {
    const rows = groupMessages(
      [msg("2026-08-21T10:00:00Z", "a", "1"), msg("2026-08-21T10:01:00Z", "b", "2")],
      NOW,
    );
    expect(rows[1].showHeader).toBe(true);
  });

  it("breaks the run after a long enough gap", () => {
    const later = new Date(Date.parse("2026-08-21T10:00:00Z") + GROUP_WINDOW_MS + 1000);
    const rows = groupMessages(
      [msg("2026-08-21T10:00:00Z", "a", "1"), msg(later.toISOString(), "a", "2")],
      NOW,
    );
    expect(rows[1].showHeader).toBe(true);
  });

  it("holds a run together right up to the window", () => {
    const inside = new Date(Date.parse("2026-08-21T10:00:00Z") + GROUP_WINDOW_MS - 1000);
    const rows = groupMessages(
      [msg("2026-08-21T10:00:00Z", "a", "1"), msg(inside.toISOString(), "a", "2")],
      NOW,
    );
    expect(rows[1].showHeader).toBe(false);
  });

  it("always heads the first message of a day, even mid-run", () => {
    // A block continuing across a date heading looks like it belongs to it.
    //
    // Built from local components rather than a `Z` timestamp: the day boundary
    // that matters is the reader's midnight, and writing this in UTC made the
    // test pass or fail depending on the machine's offset.
    const beforeMidnight = new Date(2026, 7, 20, 23, 59).toISOString();
    const afterMidnight = new Date(2026, 7, 21, 0, 1).toISOString();

    const rows = groupMessages(
      [msg(beforeMidnight, "a", "1"), msg(afterMidnight, "a", "2")],
      new Date(2026, 7, 21, 12, 0),
    );
    expect(rows[1].dayLabel).toBe("Today");
    expect(rows[1].showHeader).toBe(true);
  });

  it("copes with nothing", () => {
    expect(groupMessages([], NOW)).toEqual([]);
  });
});
