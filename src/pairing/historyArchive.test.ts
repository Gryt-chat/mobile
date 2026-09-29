import { describe, expect, it } from "vitest";

import type { ArchiveCursor, ArchivedMessage } from "../archive/messageArchive";
import { historyArchiveOf } from "./historyArchive";

const message = (i: number): ArchivedMessage => ({
  scope: "s",
  conversationId: "c",
  messageId: `m${String(i).padStart(2, "0")}`,
  sentAt: 1000 + i,
  senderId: "u",
  text: `t${i}`,
  attachments: {},
});

/** Rows newest first, where the ones in `broken` don't open, the way a damaged record reads. */
function rowsOver(all: ArchivedMessage[], broken: Set<string>) {
  return async (_scope: string, _conversationId: string, before: ArchiveCursor | undefined, limit: number) => {
    const older = all
      .filter((m) => !before || m.sentAt < before.sentAt || (m.sentAt === before.sentAt && m.messageId < before.messageId))
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, limit);
    const last = older.at(-1);
    return {
      messages: older.filter((m) => !broken.has(m.messageId)).reverse(),
      read: older.length,
      oldest: last ? { sentAt: last.sentAt, messageId: last.messageId } : null,
    };
  };
}

describe("the archive as core pages it", () => {
  it("fills a page past records that don't open, so core doesn't stop early", async () => {
    const all = Array.from({ length: 10 }, (_, i) => message(i));
    const archive = historyArchiveOf({
      conversations: async () => [{ scope: "s", conversationId: "c", count: 10 }],
      rows: rowsOver(all, new Set(["m09", "m08"])),
    });
    const page = await archive.page("s", "c", { limit: 4 });
    expect(page.map((r) => r.messageId).sort()).toEqual(["m04", "m05", "m06", "m07"]);
    expect(page[0].message).toMatchObject({ senderId: "u", attachments: {} });

    const rest = await archive.page("s", "c", { limit: 10, before: { sentAt: 1004, messageId: "m04" } });
    expect(rest.map((r) => r.messageId).sort()).toEqual(["m00", "m01", "m02", "m03"]);
  });
});
