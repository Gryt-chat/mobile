import { describe, expect, it } from "vitest";

import { nameTags, nameTagsFor } from "./nameTags";
import { linkTaggedMentions, pickableNames } from "./taggedMentions";

const golds = [
  { serverUserId: "u1", nickname: "Gold", identityFingerprint: "2xtQaa" },
  { serverUserId: "u2", nickname: "gold", identityFingerprint: "5SwEbb" },
  { serverUserId: "u3", nickname: "Ada", identityFingerprint: "zzzzzz" },
];

describe("name tags (GRYT-1674)", () => {
  it("tags only names somebody else shares, ignoring case", () => {
    const tags = nameTags(golds);
    expect(tags.get("u1")).toBe("2xtQ");
    expect(tags.get("u2")).toBe("5SwE");
    expect(tags.has("u3")).toBe(false);
  });

  it("falls back to the id when the server sends no fingerprint", () => {
    const tags = nameTags([{ serverUserId: "abcdef", nickname: "X" }, { serverUserId: "ghijkl", nickname: "x" }]);
    expect(tags.get("abcdef")).toBe("abcd");
  });

  it("works a record out once", () => {
    const record = { u1: golds[0], u2: golds[1] };
    expect(nameTagsFor(record)).toBe(nameTagsFor(record));
  });

  it("offers a shared name once per member", () => {
    const tags = nameTags(golds);
    expect(pickableNames(["Gold", "gold", "Ada", "everyone"], golds, tags)).toEqual([
      "Gold·2xtQ",
      "gold·5SwE",
      "Ada",
      "everyone",
    ]);
  });

  it("turns a picked tagged name into that member's link, and leaves code alone", () => {
    const tags = nameTags(golds);
    expect(linkTaggedMentions("hey @Gold·2xtQ and @gold·5SwE `@Gold·2xtQ`", golds, tags)).toBe(
      "hey [@Gold](mention:u1) and [@gold](mention:u2) `@Gold·2xtQ`",
    );
    expect(linkTaggedMentions("plain @Gold", golds, tags)).toBe("plain @Gold");
  });
});
