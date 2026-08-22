import { describe, expect, it } from "vitest";

import { shortChannelName } from "./channelName";

describe("shortChannelName", () => {
  it("leaves a name that already fits alone", () => {
    expect(shortChannelName("general")).toBe("general");
  });

  it("leaves a name that is exactly the limit alone", () => {
    expect(shortChannelName("abcde", 5)).toBe("abcde");
  });

  it("cuts a long one and marks it", () => {
    expect(shortChannelName("announcements-and-release-notes-for-everybody", 10)).toBe(
      "announceme…",
    );
  });

  /* "dev —…" reads as a typo. The separator the cut landed on goes with it. */
  it("does not leave a dangling separator before the ellipsis", () => {
    expect(shortChannelName("Lounge — the one", 9)).toBe("Lounge…");
    expect(shortChannelName("dev-log-and-more", 8)).toBe("dev-log…");
  });

  it("does not leave a trailing space before the ellipsis", () => {
    expect(shortChannelName("Lounge talk", 7)).toBe("Lounge…");
  });

  it("handles an empty name without inventing one", () => {
    expect(shortChannelName("")).toBe("");
  });
});
