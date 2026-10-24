import type { MlsDmContent } from "@gryt/core";
import { describe, expect, it, vi } from "vitest";

import type { ArchivedMessage } from "../archive/messageArchive";

let n = 0;
vi.mock("expo-crypto", () => ({ randomUUID: () => `id-${n++}` }));
const { shareHistory } = await import("./shareHistory");

describe("sending your copy of a DM (GRYT-1875)", () => {
  it("pages the whole conversation and sends it as history batches", async () => {
    const all: ArchivedMessage[] = Array.from({ length: 1200 }, (_, i) => ({
      scope: "s", conversationId: "dm_1", messageId: `m${i}`, sentAt: i, senderId: i % 2 ? "kari" : "sable", text: `t${i}`, attachments: {},
    }));
    const archive = {
      page: async (_s: string, _c: string, { before, limit = 50 }: { before?: { sentAt: number }; limit?: number } = {}) => {
        const older = all.filter((m) => !before || m.sentAt < before.sentAt);
        return older.slice(Math.max(0, older.length - limit));
      },
    };
    const sent: MlsDmContent[] = [];
    const source = { storeScope: "s", send: async (_c: string, _p: string, content: MlsDmContent) => void sent.push(content) };
    expect(await shareHistory(source, archive, "dm_1", "sable")).toBe(1200);
    expect(sent.every((c) => c.type === "history")).toBe(true);
  });
});
