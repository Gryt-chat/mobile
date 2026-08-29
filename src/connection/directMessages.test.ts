import { describe, expect, it } from "vitest";

import {
  conversationTitle,
  isDirectConversationId,
  promoteConversation,
  type DirectConversation,
} from "./directMessages";

function participant(nickname: string) {
  return {
    server_user_id: `user_${nickname}`,
    nickname,
    avatar_file_id: null,
    avatar_worn: null,
  };
}

function conversation(id: string, nickname: string): DirectConversation {
  return {
    conversation_id: id,
    kind: "dm",
    name: null,
    icon_file_id: null,
    created_at: "2026-08-29T10:00:00.000Z",
    last_message_at: null,
    members: [participant(nickname)],
    other: participant(nickname),
  };
}

function group(id: string, name: string | null, nicknames: string[]): DirectConversation {
  const members = nicknames.map(participant);
  return {
    conversation_id: id,
    kind: "group",
    name,
    icon_file_id: null,
    created_at: "2026-08-29T10:00:00.000Z",
    last_message_at: null,
    members,
    other: members[0],
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

describe("naming a conversation", () => {
  it("uses the other person for a one-to-one", () => {
    expect(conversationTitle(conversation("dm_1", "Alice"))).toBe("Alice");
  });

  it("uses a group's name when it has one", () => {
    expect(conversationTitle(group("dm_g1", "Weekend plans", ["Alice", "Bob"]))).toBe(
      "Weekend plans",
    );
  });

  it("reads an unnamed group off who is in it", () => {
    // Built rather than stored, so renaming somebody changes what the group is
    // called instead of leaving a stale string behind.
    expect(conversationTitle(group("dm_g2", null, ["Alice", "Bob"]))).toBe("Alice and Bob");
  });

  it("stops listing names past two", () => {
    expect(conversationTitle(group("dm_g3", null, ["Alice", "Bob", "Kim", "Wren"]))).toBe(
      "Alice, Bob and 2 more",
    );
  });

  it("says something for a group with nobody left in it", () => {
    // Everybody else leaving is possible, and a row with an empty name reads
    // as a broken row rather than an empty group.
    expect(conversationTitle(group("dm_g4", null, []))).toBe("Group");
  });
});
