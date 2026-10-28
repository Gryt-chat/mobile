import { describe, expect, it } from "vitest";

import { snippetParts } from "./channelSearch";

describe("snippetParts", () => {
  it("splits at the hit markers", () => {
    expect(snippetParts("I do, but the HDMI \u0002cable\u0003 is dead")).toEqual([
      { text: "I do, but the HDMI ", hit: false },
      { text: "cable", hit: true },
      { text: " is dead", hit: false },
    ]);
  });

  it("is one plain part with no markers, and nothing for an empty snippet", () => {
    expect(snippetParts("hello")).toEqual([{ text: "hello", hit: false }]);
    expect(snippetParts("")).toEqual([]);
  });
});
