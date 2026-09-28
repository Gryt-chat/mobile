import { describe, expect, it } from "vitest";

import {
  deriveEmojiName,
  emojiImageUrl,
  isEmojiItem,
  isValidEmojiName,
  sanitizeTypedName,
} from "./emojis";

describe("isEmojiItem", () => {
  it("accepts a name and a file id", () => {
    expect(isEmojiItem({ name: "party_parrot", file_id: "abc" })).toBe(true);
  });

  it("refuses anything missing either field", () => {
    expect(isEmojiItem({ name: "x" })).toBe(false);
    expect(isEmojiItem({ file_id: "abc" })).toBe(false);
    expect(isEmojiItem(null)).toBe(false);
  });
});

describe("deriveEmojiName", () => {
  it("strips the extension", () => {
    expect(deriveEmojiName("party_parrot.png")).toBe("party_parrot");
  });

  it("drops a leading numeric prefix", () => {
    expect(deriveEmojiName("042-cool_dog.gif")).toBe("cool_dog");
  });

  it("turns anything outside the alphabet into an underscore", () => {
    expect(deriveEmojiName("my photo!!.jpg")).toBe("my_photo");
  });

  it("collapses repeated underscores and trims them off the ends", () => {
    expect(deriveEmojiName("__weird--name__.png")).toBe("weird_name");
  });

  it("pads a name under two characters", () => {
    expect(deriveEmojiName("a.png")).toBe("a_");
  });

  it("truncates to 32", () => {
    expect(deriveEmojiName(`${"a".repeat(50)}.png`).length).toBe(32);
  });
});

describe("sanitizeTypedName", () => {
  it("keeps only letters, numbers and underscores", () => {
    expect(sanitizeTypedName("cool dog!")).toBe("cooldog");
  });

  it("caps at 32 characters", () => {
    expect(sanitizeTypedName("a".repeat(40)).length).toBe(32);
  });
});

describe("isValidEmojiName", () => {
  it("accepts 2 to 32 letters, numbers or underscores", () => {
    expect(isValidEmojiName("ok")).toBe(true);
    expect(isValidEmojiName("party_parrot")).toBe(true);
  });

  it("refuses one character, an empty string, or a name over 32", () => {
    expect(isValidEmojiName("a")).toBe(false);
    expect(isValidEmojiName("")).toBe(false);
    expect(isValidEmojiName("a".repeat(33))).toBe(false);
  });
});

describe("emojiImageUrl", () => {
  it("encodes the name into the img route", () => {
    expect(emojiImageUrl("http://gryt.local", "party parrot")).toBe(
      "http://gryt.local/api/emojis/img/party%20parrot",
    );
  });
});
