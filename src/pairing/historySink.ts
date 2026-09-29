import type { HistorySink } from "@gryt/core";

import type { ArchivedMessage } from "../archive/messageArchive";
import { fromHistoryRecord } from "./historyRecords";

/** The other device's history into this phone's archive. A record that doesn't check out is dropped. */
export function historySinkInto(put: (messages: ArchivedMessage[]) => Promise<void>): HistorySink {
  return {
    async put(records) {
      const messages = records.map(fromHistoryRecord).filter((m): m is ArchivedMessage => m !== null);
      if (messages.length) await put(messages);
    },
  };
}
