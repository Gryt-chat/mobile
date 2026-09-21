import { describe, expect, it } from "vitest";

import type { DirectConversation } from "../connection/directMessages";
import type { Member } from "../connection/types";
import { createdGroup, matching, pickable } from "./newMessage";

/**
 * New group used to offer bots, which the server refuses, and nothing opened the group
 * a create made. These are the two answers the dialog leans on (GRYT-1342).
 */

const member = (serverUserId: string, nickname: string, extra: Partial<Member> = {}): Member =>
  ({ serverUserId, nickname, ...extra });

const names = (list: Member[]) => list.map((m) => m.nickname);

describe("pickable", () => {
  const all = [
    member("me", "Me"),
    member("u-carol", "carol"),
    member("u-bot", "Helper", { isBot: true }),
    member("u-bob", "Bob"),
  ];

  it("offers everybody but you and bots, by name", () => {
    expect(names(pickable(all, "me"))).toEqual(["Bob", "carol"]);
  });

  it("offers nobody until it knows who you are, rather than you to yourself", () => {
    expect(pickable(all, null)).toEqual([]);
  });
});

describe("matching", () => {
  it("matches part of a name, ignoring case and spaces around the query", () => {
    const list = [member("a", "Bob"), member("b", "Carol")];
    expect(names(matching(list, "  bO "))).toEqual(["Bob"]);
    expect(names(matching(list, ""))).toEqual(["Bob", "Carol"]);
  });
});

describe("createdGroup", () => {
  const group = (id: string, people: string[]) =>
    ({
      conversation_id: id,
      kind: "group",
      name: null,
      icon_file_id: null,
      created_at: "2026-09-21T10:00:00Z",
      last_message_at: null,
      members: people.map((p) => ({ server_user_id: p, nickname: p, avatar_file_id: null, avatar_worn: null })),
      other: { server_user_id: people[0], nickname: people[0], avatar_file_id: null, avatar_worn: null },
    }) as DirectConversation;

  it("answers with the new group, never an older one with the same people", () => {
    const before = new Set(["g-old"]);
    const old = group("g-old", ["u-bob", "u-carol"]);
    expect(createdGroup([old], before, ["u-carol", "u-bob"])).toBeUndefined();

    const made = group("g-new", ["u-carol", "u-bob"]);
    expect(createdGroup([made, old], before, ["u-bob", "u-carol"])?.conversation_id).toBe("g-new");
  });

  it("ignores a new group with other people in it", () => {
    expect(createdGroup([group("g-x", ["u-bob", "u-dave"])], new Set(), ["u-bob", "u-carol"])).toBeUndefined();
  });
});
