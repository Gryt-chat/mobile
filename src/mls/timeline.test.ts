import { describe, expect, it } from "vitest";

import type { ArchivedMessage } from "../archive/messageArchive";
import type { LocalMessage } from "../connection/outbox";
import { applyMlsContent } from "./applyContent";
import { archivedRow, mergeTimeline, mlsNotice, newMessage, sendFailure, withOpenedFiles } from "./timeline";

const row = (id: string, minute: number, extra: Partial<LocalMessage> = {}): LocalMessage => ({
  conversation_id: "dm_1",
  message_id: id,
  sender_server_id: "kari",
  text: id,
  created_at: new Date(Date.UTC(2026, 8, 28, 10, minute)).toISOString(),
  ...extra,
});

describe("mergeTimeline", () => {
  it("drops the placeholder lines and interleaves both sides by time", () => {
    const server = [row("old", 1), row("ph", 3, { sender_server_id: "system", mls_placeholder: { seq: 1, sender_server_id: "kari" } })];
    const archived = [row("mls-a", 3, { mls: true }), row("mls-b", 5, { mls: true })];
    const merged = mergeTimeline({ server, serverHasMore: false, archived, archiveHasMore: false });
    expect(merged.map((m) => m.message_id)).toEqual(["old", "mls-a", "mls-b"]);
  });

  it("holds back what is older than the other side has loaded", () => {
    const server = [row("s4", 4), row("s6", 6)];
    const archived = [row("a1", 1, { mls: true }), row("a5", 5, { mls: true })];
    const merged = mergeTimeline({ server, serverHasMore: true, archived, archiveHasMore: false });
    // s4 is the oldest server row loaded and more is up there, so a1 waits.
    expect(merged.map((m) => m.message_id)).toEqual(["s4", "a5", "s6"]);
  });

  it("keeps a failed draft at the bottom whatever its time", () => {
    const server = [row("s1", 1)];
    const archived = [row("a2", 2, { mls: true }), row("pending:x", 0, { failed: true, nonce: "x", mls: true })];
    const merged = mergeTimeline({ server, serverHasMore: false, archived, archiveHasMore: true });
    expect(merged.map((m) => m.message_id)).toEqual(["pending:x", "a2"]);
  });
});

describe("archivedRow", () => {
  it("draws an archived message as a row, with its reply and edit", () => {
    const m: ArchivedMessage = {
      scope: "s",
      conversationId: "dm_1",
      messageId: "m1",
      sentAt: 1000,
      senderId: "ola",
      text: "hei",
      attachments: {},
      editedAt: 2000,
      replyTo: "m0",
    };
    expect(archivedRow(m, () => "Ola")).toMatchObject({
      message_id: "m1",
      sender_nickname: "Ola",
      created_at: new Date(1000).toISOString(),
      edited_at: new Date(2000).toISOString(),
      reply_to_message_id: "m0",
      mls: true,
    });
  });
});

describe("mlsNotice", () => {
  const none = { undecryptable: 0, lost: null };
  it("says nothing on a healthy MLS conversation", () => {
    expect(mlsNotice({ kind: "mls" }, none, false, "Ola")).toBeNull();
    expect(mlsNotice({ kind: "sealed-v1", reason: "peer_without_mls" }, none, false, "Ola")).toBeNull();
  });

  it("says why a send is refused, and counts what couldn't be read", () => {
    expect(mlsNotice({ kind: "refused", reason: "peer_left_mls" }, none, false, "Ola")).toContain("Ola");
    expect(mlsNotice({ kind: "mls" }, { undecryptable: 1, lost: null }, false, "Ola")).toBe(
      "1 message couldn't be decrypted on this phone.",
    );
    expect(mlsNotice({ kind: "mls" }, { undecryptable: 3, lost: null }, false, "Ola")).toContain("3 messages");
    expect(mlsNotice({ kind: "mls" }, none, true, "Ola")).toBe("Older messages were cleared from this phone.");
  });
});

const key = (id: string) => ({ id, key: "k".repeat(43), iv: "i".repeat(16), mime: "image/png" });

describe("files in an MLS message (GRYT-1523)", () => {
  it("puts every uploaded file's key in the message", () => {
    expect(newMessage("m", "", "r", { ids: ["f1", "f2"], keys: { f1: key("a"), f2: key("b") } })).toEqual({
      type: "message",
      id: "m",
      text: "",
      replyTo: "r",
      attachments: { f1: key("a"), f2: key("b") },
    });
    expect(newMessage("m", "hei", null, null)).toEqual({ type: "message", id: "m", text: "hei" });
  });

  it("won't send a file that has no key", () => {
    expect(newMessage("m", "hei", null, { ids: ["f1", "f2"], keys: { f1: key("a") } })).toBeNull();
  });

  it("shows files as they open, and a failed one as its id", () => {
    const r = row("m", 1, { attachments: ["f1", "f2", "f3"], mls: true });
    const opened = new Map<string, { file_id: string; local_uri?: string } | "failed">([
      ["f1", { file_id: "f1", local_uri: "file:///f1" }],
      ["f3", "failed"],
    ]);
    expect(withOpenedFiles(r, opened).enriched_attachments).toEqual([{ file_id: "f1", local_uri: "file:///f1" }, { file_id: "f3" }]);
    expect(withOpenedFiles(r, new Map()).enriched_attachments).toBeUndefined();
  });

  it("lists an archived message's files by upload id", () => {
    const m: ArchivedMessage = { scope: "s", conversationId: "c", messageId: "m", sentAt: 1, senderId: "ola", text: "", attachments: { f1: key("a") } };
    expect(archivedRow(m, () => undefined).attachments).toEqual(["f1"]);
    expect(archivedRow({ ...m, attachments: {} }, () => undefined).attachments).toBeNull();
  });
});

describe("sendFailure", () => {
  it("names the two failures somebody can do something about", () => {
    expect(sendFailure({ code: "peer_unverified" })).toContain("keys");
    expect(sendFailure({ code: "waiting_for_welcome" })).toContain("added");
    expect(sendFailure(new Error("socket"))).toBe("Not sent.");
  });
});

describe("applyMlsContent", () => {
  function memory() {
    const rows = new Map<string, ArchivedMessage>();
    return {
      rows,
      get: async (_s: string, _c: string, id: string) => rows.get(id) ?? null,
      put: async (ms: ArchivedMessage[]) => void ms.forEach((m) => rows.set(m.messageId, m)),
      remove: async (_s: string, _c: string, id: string) => void rows.delete(id),
    };
  }
  const base = { scope: "s", conversationId: "dm_1", at: 1000 };

  it("stores, edits and deletes a message from its sender", async () => {
    const db = memory();
    await applyMlsContent(db, { ...base, senderId: "ola", content: { type: "message", id: "m", text: "hei", replyTo: "q" } });
    await applyMlsContent(db, { ...base, at: 2000, senderId: "ola", content: { type: "edit", id: "m", text: "hallo" } });
    expect(db.rows.get("m")).toMatchObject({ text: "hallo", editedAt: 2000, sentAt: 1000, replyTo: "q" });
    await applyMlsContent(db, { ...base, senderId: "ola", content: { type: "delete", id: "m" } });
    expect(db.rows.has("m")).toBe(false);
  });

  it("won't let somebody else overwrite, edit or delete your message", async () => {
    const db = memory();
    await applyMlsContent(db, { ...base, senderId: "me", content: { type: "message", id: "m", text: "mine" } });
    await applyMlsContent(db, { ...base, senderId: "ola", content: { type: "message", id: "m", text: "theirs" } });
    await applyMlsContent(db, { ...base, senderId: "ola", content: { type: "edit", id: "m", text: "edited" } });
    await applyMlsContent(db, { ...base, senderId: "ola", content: { type: "delete", id: "m" } });
    expect(db.rows.get("m")).toMatchObject({ text: "mine", senderId: "me" });
  });

  it("keeps the files' keys with the message", async () => {
    const db = memory();
    await applyMlsContent(db, { ...base, senderId: "ola", content: { type: "message", id: "m", text: "", attachments: { f1: key("a") } } });
    expect(db.rows.get("m")?.attachments).toEqual({ f1: key("a") });
  });

  it("ignores an edit for a message this phone never had", async () => {
    const db = memory();
    await applyMlsContent(db, { ...base, senderId: "ola", content: { type: "edit", id: "gone", text: "x" } });
    expect(db.rows.size).toBe(0);
  });
});
