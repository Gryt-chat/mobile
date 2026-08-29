import { describe, expect, it } from "vitest";

import { isDirectConversationId, promoteConversation, type DirectConversation } from "./directMessages";

function conversation(id: string, nickname: string): DirectConversation {
  return {
    conversation_id: id,
    created_at: "2026-08-29T10:00:00.000Z",
    last_message_at: null,
    other: {
      server_user_id: `user_${nickname}`,
      nickname,
      avatar_file_id: null,
      avatar_worn: null,
    },
  };
}

describe("telling a direct message from a channel", () => {
  it("reads the prefix and nothing else", () => {
    expect(isDirectConversationId("dm_abc123")).toBe(true);
    expect(isDirectConversationId("general")).toBe(false);
    expect(isDirectConversationId("dm")).toBe(false);
    // A channel an operator called `dm_something` would collide, and cannot:
    // channel ids come from the operator, DM ids are a hash the server derives,
    // and both live in the same column. Worth knowing rather than worth
    // guarding — the access rule is membership, never the shape of the id.
    expect(isDirectConversationId(null)).toBe(false);
    expect(isDirectConversationId(undefined)).toBe(false);
  });
});

describe("promoting a conversation", () => {
  it("puts a new one at the top", () => {
    const existing = [conversation("dm_1", "Alice")];
    const next = promoteConversation(existing, conversation("dm_2", "Bob"));

    expect(next.map((c) => c.conversation_id)).toEqual(["dm_2", "dm_1"]);
  });

  it("moves one that is already listed rather than listing it twice", () => {
    // `dm:opened` arrives for a conversation that already exists as well as for
    // a new one — opening the same DM a second time is the common case, not an
    // edge one, and appending would draw the same person twice.
    const existing = [conversation("dm_1", "Alice"), conversation("dm_2", "Bob")];
    const next = promoteConversation(existing, conversation("dm_2", "Bob"));

    expect(next).toHaveLength(2);
    expect(next.map((c) => c.conversation_id)).toEqual(["dm_2", "dm_1"]);
  });

  it("takes the server's copy over the one already held", () => {
    // The payload is the server's whole view, so a nickname changed since the
    // list was fetched should win rather than be kept out by the stale copy.
    const existing = [conversation("dm_1", "Alice")];
    const renamed = conversation("dm_1", "Alice Cooper");
    const next = promoteConversation(existing, renamed);

    expect(next).toHaveLength(1);
    expect(next[0].other.nickname).toBe("Alice Cooper");
  });

  it("leaves the input alone", () => {
    const existing = [conversation("dm_1", "Alice")];
    promoteConversation(existing, conversation("dm_2", "Bob"));

    expect(existing.map((c) => c.conversation_id)).toEqual(["dm_1"]);
  });
});
