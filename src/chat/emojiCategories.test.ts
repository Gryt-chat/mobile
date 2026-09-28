import { describe, expect, it } from "vitest";

import { getStandardEmojisByCategory, reactionSrcFor, searchEmojis } from "./emojiCategories";

describe("searchEmojis", () => {
  it("puts an exact-prefix name ahead of a substring match", () => {
    const results = searchEmojis("heart", []);
    expect(results[0].name.startsWith("heart")).toBe(true);
  });

  it("finds a custom emoji by name too", () => {
    const custom = [{ name: "party-parrot", emoji: null, isCustom: true, url: "x", tags: [], aliases: [] }];
    expect(searchEmojis("parrot", custom).some((e) => e.isCustom)).toBe(true);
  });

  it("is empty for a blank query", () => {
    expect(searchEmojis("   ", [])).toEqual([]);
  });
});

describe("getStandardEmojisByCategory", () => {
  it("groups into the desktop's own category names", () => {
    const categories = [...getStandardEmojisByCategory().keys()];
    expect(categories).toContain("Smileys & Emotion");
    expect(categories).toContain("Animals & Nature");
  });
});

describe("reactionSrcFor", () => {
  it("is the character itself for a standard emoji", () => {
    expect(reactionSrcFor({ name: "fire", emoji: "\u{1F525}", isCustom: false, tags: [], aliases: [] })).toBe("\u{1F525}");
  });

  it("is a shortcode for a custom one", () => {
    expect(reactionSrcFor({ name: "owl", emoji: null, isCustom: true, tags: [], aliases: [] })).toBe(":owl:");
  });
});
