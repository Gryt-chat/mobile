import { describe, expect, it } from "vitest";

import type { LocalMessage } from "../connection/outbox";
import { canReplyTo } from "./replyable";

const sent = { message_id: "m1", sender_server_id: "user_a", conversation_id: "general", created_at: "2026-10-09T00:00:00Z" } as LocalMessage;

describe("canReplyTo", () => {
  it("allows a message somebody sent", () => {
    expect(canReplyTo(sent)).toBe(true);
  });

  it("refuses the server's own announcements, and anything not yet sent", () => {
    expect(canReplyTo({ ...sent, sender_server_id: "system" })).toBe(false);
    expect(canReplyTo({ ...sent, pending: true })).toBe(false);
    expect(canReplyTo({ ...sent, failed: true })).toBe(false);
    expect(canReplyTo({ ...sent, message_id: "pending:abc" })).toBe(false);
  });
});
