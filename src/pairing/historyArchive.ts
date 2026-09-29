import type { HistoryArchive } from "@gryt/core";
import type { HistoryRecord } from "@gryt/crypto";

import type { MessageArchive } from "../archive/messageArchive";
import { toHistoryRecord } from "./historyRecords";

/** This phone's archive as core reads it for the history a linked device gets (GRYT-1484). */
export function historyArchiveOf(messages: Pick<MessageArchive, "conversations" | "rows">): HistoryArchive {
  return {
    conversations: () => messages.conversations(),
    async page(scope, conversationId, { before, limit }) {
      const out: HistoryRecord[] = [];
      let cursor = before;
      // Core reads a short page as the end, so rows that didn't open are made up from further back.
      while (out.length < limit) {
        const want = limit - out.length;
        const { messages: got, read, oldest } = await messages.rows(scope, conversationId, cursor, want);
        out.push(...got.map(toHistoryRecord));
        if (read < want || !oldest) break;
        cursor = oldest;
      }
      return out;
    },
  };
}
