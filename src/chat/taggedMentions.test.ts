import { describe, expect, it } from "vitest";

import { nameTags, nameTagsFor } from "./nameTags";
import { linkTaggedMentions, pickableNames } from "./taggedMentions";

const golds = [
  { serverUserId: "u1", nickname: "Gold", createdAt: "2026-10-06T08:00:00Z" },
  { serverUserId: "u2", nickname: "gold", createdAt: "2026-10-01T08:00:00Z" },
  { serverUserId: "u3", nickname: "Ada", createdAt: "2026-01-01T00:00:00Z" },
];

describe("name numbers (GRYT-1674)", () => {
  it("numbers a shared name by join order, ignoring case", () => {
    const tags = nameTags(golds);
    expect(tags.get("u2")).toBe("#1");
    expect(tags.get("u1")).toBe("#2");
    expect(tags.has("u3")).toBe(false);
  });

  it("puts a member with no date last, by id", () => {
    const tags = nameTags([{ serverUserId: "b", nickname: "X" }, { serverUserId: "a", nickname: "x" }]);
    expect([tags.get("a"), tags.get("b")]).toEqual(["#1", "#2"]);
    const shared = nameTags([{ serverUserId: "b", nickname: "Gold" }, ...golds]);
    expect(shared.get("b")).toBe("#3");
  });

  it("works a record out once", () => {
    const record = { u1: golds[0], u2: golds[1] };
    expect(nameTagsFor(record)).toBe(nameTagsFor(record));
  });

  it("offers a shared name once per member", () => {
    const tags = nameTags(golds);
    expect(pickableNames(["Gold", "gold", "Ada", "everyone"], golds, tags)).toEqual([
      "Gold#2",
      "gold#1",
      "Ada",
      "everyone",
    ]);
  });

  it("turns a picked numbered name into that member's link, and leaves code alone", () => {
    const tags = nameTags(golds);
    expect(linkTaggedMentions("hey @Gold#2 and @gold#1 `@Gold#2`", golds, tags)).toBe(
      "hey [@Gold](mention:u1) and [@gold](mention:u2) `@Gold#2`",
    );
    expect(linkTaggedMentions("plain @Gold #channel", golds, tags)).toBe("plain @Gold #channel");
  });
});
