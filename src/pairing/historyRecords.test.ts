import type { HistoryRecord } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import type { ArchivedMessage } from "../archive/messageArchive";
import { fromHistoryRecord, toHistoryRecord } from "./historyRecords";

const attachment = { id: "att-1", key: "a2V5", iv: "aXY", name: "cat.png", mime: "image/png", width: 10, height: 20 };

const full: ArchivedMessage = {
  scope: "chat.example",
  conversationId: "dm-1",
  messageId: "m1",
  sentAt: 1_700_000_000_000,
  senderId: "user-1",
  senderDeviceId: "dev-a",
  text: "hello",
  attachments: { "upload-1": attachment },
  editedAt: 1_700_000_000_500,
  replyTo: "m0",
  reactions: [{ src: "👍", amount: 2, users: ["user-1", "user-2"] }],
};

const bare: ArchivedMessage = {
  scope: "chat.example",
  conversationId: "dm-1",
  messageId: "m2",
  sentAt: 1_700_000_001_000,
  senderId: "user-2",
  text: "hi",
  attachments: {},
};

const record = (message: unknown, over: Partial<HistoryRecord> = {}): HistoryRecord => ({
  scope: "chat.example",
  conversationId: "dm-1",
  messageId: "m1",
  sentAt: 5,
  message,
  ...over,
});

describe("history records between devices", () => {
  it("puts the four ids outside and the rest in `message`, with unset fields left off", () => {
    expect(toHistoryRecord(bare)).toEqual({
      scope: "chat.example",
      conversationId: "dm-1",
      messageId: "m2",
      sentAt: 1_700_000_001_000,
      message: { senderId: "user-2", text: "hi", attachments: {} },
    });
    expect(Object.keys(toHistoryRecord(full).message as object).sort()).toEqual(
      ["attachments", "editedAt", "reactions", "replyTo", "senderDeviceId", "senderId", "text"].sort(),
    );
  });

  it("round-trips through JSON, as it does inside a sealed chunk", () => {
    for (const m of [full, bare]) {
      const wire = JSON.parse(JSON.stringify(toHistoryRecord(m))) as HistoryRecord;
      expect(fromHistoryRecord(wire)).toEqual(m);
    }
  });

  it("leaves off an empty reaction list rather than sending one", () => {
    expect(toHistoryRecord({ ...bare, reactions: [] }).message).not.toHaveProperty("reactions");
  });

  it("drops a record whose body isn't a message", () => {
    expect(fromHistoryRecord(record(null))).toBeNull();
    expect(fromHistoryRecord(record("hello"))).toBeNull();
    expect(fromHistoryRecord(record([]))).toBeNull();
    expect(fromHistoryRecord(record({ text: "no sender", attachments: {} }))).toBeNull();
    expect(fromHistoryRecord(record({ senderId: "u", text: 5, attachments: {} }))).toBeNull();
    expect(fromHistoryRecord(record({ senderId: "u", text: "x" }))).toBeNull();
    expect(fromHistoryRecord(record({ senderId: "u", text: "x", attachments: [] }))).toBeNull();
    expect(fromHistoryRecord(record({ senderId: "u", text: "x", attachments: {} }, { sentAt: NaN }))).toBeNull();
  });

  it("drops a bad optional field and keeps the record", () => {
    const out = fromHistoryRecord(
      record({
        senderId: "u",
        text: "x",
        attachments: { good: attachment, bad: { id: "x" }, worse: "nope" },
        senderDeviceId: 7,
        editedAt: "yesterday",
        replyTo: { id: "m0" },
        reactions: [{ src: "👍", amount: 1, users: ["u"] }, { src: "👎", amount: "1", users: [] }, "🙂"],
        extra: "ignored",
      }),
    );
    expect(out).toEqual({
      scope: "chat.example",
      conversationId: "dm-1",
      messageId: "m1",
      sentAt: 5,
      senderId: "u",
      text: "x",
      attachments: { good: attachment },
      reactions: [{ src: "👍", amount: 1, users: ["u"] }],
    });
  });

  it("can't be steered at a prototype through an attachment id", () => {
    const wire = JSON.parse(`{"senderId":"u","text":"x","attachments":{"__proto__":${JSON.stringify(attachment)}}}`);
    const out = fromHistoryRecord(record(wire));
    expect(out?.attachments).toEqual({});
    expect(Object.getPrototypeOf(out?.attachments)).toBe(Object.prototype);
  });
});
