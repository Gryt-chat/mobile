import { describe, expect, it } from "vitest";

import type { SessionIdentity } from "./claims";
import {
  discardDraft,
  draftId,
  draftMessage,
  hasPending,
  markLatestFailed,
  markSending,
  receiveMessage,
  type LocalMessage,
} from "./outbox";
import type { Message } from "./types";

const me: SessionIdentity = { serverUserId: "me", nickname: "Sivert" };

function serverMessage(over: Partial<Message> & { nonce?: string } = {}) {
  return {
    conversation_id: "general",
    message_id: "server-1",
    sender_server_id: "me",
    text: "hello",
    created_at: "2026-08-21T10:00:00.000Z",
    ...over,
  };
}

function draft(text = "hello", nonce = "n1"): LocalMessage {
  return draftMessage({ channelId: "general", text, nonce, me });
}

describe("draftMessage", () => {
  it("carries our own sender id so it groups with our real messages", () => {
    const d = draft();
    expect(d.sender_server_id).toBe("me");
    expect(d.sender_nickname).toBe("Sivert");
    expect(d.pending).toBe(true);
  });

  it("uses an id that cannot collide with the server's", () => {
    expect(draft().message_id).toBe("pending:n1");
    expect(draftId("abc")).toBe("pending:abc");
  });

  it("still produces a row when the token had no claims to read", () => {
    const d = draftMessage({ channelId: "general", text: "hi", nonce: "n1", me: null });
    expect(d.sender_server_id).toBe("");
    expect(d.text).toBe("hi");
  });
});

describe("receiveMessage", () => {
  it("replaces the draft the nonce names", () => {
    const list = receiveMessage([draft()], serverMessage({ nonce: "n1" }), me);
    expect(list).toHaveLength(1);
    expect(list[0].message_id).toBe("server-1");
    expect(list[0].pending).toBeUndefined();
  });

  it("does not keep the nonce on the stored message", () => {
    const [stored] = receiveMessage([draft()], serverMessage({ nonce: "n1" }), me);
    expect("nonce" in stored).toBe(false);
  });

  it("appends somebody else's message and leaves the draft pending", () => {
    const list = receiveMessage(
      [draft()],
      serverMessage({ message_id: "other", sender_server_id: "them", text: "hi" }),
      me,
    );
    expect(list.map((m) => m.message_id)).toEqual(["pending:n1", "other"]);
    expect(list[0].pending).toBe(true);
  });

  it("ignores a message it already holds", () => {
    const first = receiveMessage([], serverMessage(), me);
    const again = receiveMessage(first, serverMessage(), me);
    expect(again).toHaveLength(1);
  });

  /* A resend hits the server's nonce cache, and a server older than GRYT-422
   * replays the stored message without re-attaching the nonce. Without this the
   * reader sees the message twice: once greyed out forever, once for real. */
  it("clears the draft when our own message comes back with no nonce", () => {
    const list = receiveMessage([draft()], serverMessage(), me);
    expect(list).toHaveLength(1);
    expect(list[0].message_id).toBe("server-1");
  });

  it("does not let somebody else's identical text clear our draft", () => {
    const list = receiveMessage(
      [draft()],
      serverMessage({ message_id: "other", sender_server_id: "them" }),
      me,
    );
    expect(list).toHaveLength(2);
    expect(list[0].pending).toBe(true);
  });

  it("clears the older of two identical drafts", () => {
    const list = receiveMessage([draft("hi", "n1"), draft("hi", "n2")], serverMessage({ text: "hi" }), me);
    expect(list.map((m) => m.message_id)).toEqual(["pending:n2", "server-1"]);
  });

  it("leaves drafts alone when we do not know who we are", () => {
    const list = receiveMessage([draft()], serverMessage(), null);
    expect(list).toHaveLength(2);
  });
});

describe("markLatestFailed", () => {
  it("marks the newest pending message, since the error names no other", () => {
    const list = markLatestFailed([draft("one", "n1"), draft("two", "n2")], "Too fast.");
    expect(list[0].pending).toBe(true);
    expect(list[1]).toMatchObject({ pending: false, failed: true, failure: "Too fast." });
  });

  it("does nothing when nothing is outstanding", () => {
    const settled = [serverMessage()] as LocalMessage[];
    expect(markLatestFailed(settled, "whatever")).toBe(settled);
  });

  it("skips messages that already failed", () => {
    const failed = markLatestFailed([draft("one", "n1"), draft("two", "n2")], "first");
    const both = markLatestFailed(failed, "second");
    expect(both[0].failure).toBe("second");
    expect(both[1].failure).toBe("first");
  });
});

describe("markSending and discardDraft", () => {
  it("clears the failure when a retry goes out", () => {
    const failed = markLatestFailed([draft()], "Too fast.");
    const retried = markSending(failed, "n1");
    expect(retried[0]).toMatchObject({ pending: true, failed: false });
    expect(retried[0].failure).toBeUndefined();
  });

  it("takes a discarded draft off the list", () => {
    expect(discardDraft([draft()], "n1")).toEqual([]);
  });
});

describe("hasPending", () => {
  it("is true only while something is outstanding", () => {
    expect(hasPending([draft()])).toBe(true);
    expect(hasPending(markLatestFailed([draft()], "no"))).toBe(false);
    expect(hasPending([])).toBe(false);
  });
});
