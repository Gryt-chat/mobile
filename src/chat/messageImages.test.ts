import { describe, expect, it } from "vitest";

import { imageVerdict } from "./messageImages";

describe("images in messages", () => {
  const here = "community.gryt.chat";

  it("draws this server's emoji", () => {
    expect(imageVerdict("https://community.gryt.chat/api/emojis/img/kek", ":kek:", here, false)).toBe("emoji");
  });

  it("shows another server's emoji as its name unless this server allows them", () => {
    const other = "https://other.gryt.example/api/emojis/img/kek";
    expect(imageVerdict(other, ":kek:", here, false)).toBe("name");
    expect(imageVerdict(other, ":kek:", here, true)).toBe("emoji");
  });

  it("never loads a picture dressed up as an emoji from elsewhere", () => {
    expect(imageVerdict("https://tracker.example/p.png", ":kek:", here, true)).toBe("name");
  });

  it("offers any other picture as a link", () => {
    expect(imageVerdict("https://imgur.example/a.png", "a cat", here, true)).toBe("link");
  });

  it("is a name with no server or a broken address", () => {
    expect(imageVerdict("https://community.gryt.chat/api/emojis/img/kek", ":kek:", null, true)).toBe("name");
    expect(imageVerdict("not a url", ":kek:", here, true)).toBe("name");
  });
});
