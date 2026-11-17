import type { MlsDmContent } from "@gryt/core";
import { describe, expect, it, vi } from "vitest";

import type { ArchivedMessage } from "../archive/messageArchive";

let n = 0;
vi.mock("expo-crypto", () => ({ randomUUID: () => `id-${n++}` }));
const { openedSealedHistory, shareHistory } = await import("./shareHistory");

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

  it("carries the old sealed messages this phone opens, oldest first, without doubling (GRYT-2139)", async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 10, minute)).toISOString();
    const pages = [
      { items: [{ message_id: "s3", sender_server_id: "kari", created_at: at(3), sealed: "ok:three" }, { message_id: "p2", sender_server_id: "mia", created_at: at(2), text: "plain" }], hasMore: true },
      { items: [{ message_id: "s1", sender_server_id: "kari", created_at: at(1), sealed: "ok:one" }, { message_id: "bad", sender_server_id: "kari", created_at: at(0), sealed: "broken" }], hasMore: false },
    ];
    const befores: (string | undefined)[] = [];
    const older = await openedSealedHistory(
      async (before) => (befores.push(before), pages[befores.length - 1]),
      async (sealed) => {
        if (!sealed.startsWith("ok:")) throw new Error("won't open");
        return { text: sealed.slice(3), attachments: {} };
      },
      async () => undefined,
    );
    expect(befores).toEqual([undefined, at(2)]);
    expect(older.map((e) => [e.id, e.text])).toEqual([["s3", "three"], ["s1", "one"]]);

    const sent: MlsDmContent[] = [];
    const archive = {
      page: async (_s: string, _c: string, o: { before?: { sentAt: number } } = {}) =>
        o.before ? [] : [{ scope: "s", conversationId: "dm_1", messageId: "s3", sentAt: Date.parse(at(3)), senderId: "kari", text: "from MLS", attachments: {} }],
    };
    const source = { storeScope: "s", send: async (_c: string, _p: string, content: MlsDmContent) => void sent.push(content) };
    expect(await shareHistory(source, archive, "dm_1", "mia", older)).toBe(2);
    expect(sent.flatMap((c) => (c.type === "history" ? c.entries.map((e) => e.id) : []))).toEqual(["s1", "s3"]);
  });
});
