import { describe, expect, it } from "vitest";

import { drawsText, isUnknownKind, unknownKindNotice } from "./kinds";

describe("message kinds", () => {
  it("draws plain text, and hides it behind cards, polls and kinds", () => {
    expect(drawsText({})).toBe(true);
    expect(drawsText({ text_fallback: true })).toBe(false);
    expect(drawsText({ kind: "poll", poll: {} })).toBe(false);
    expect(drawsText({ poll: {} })).toBe(false);
    expect(drawsText({ kind: "event" })).toBe(false);
  });
  it("knows polls, and nothing newer", () => {
    expect(isUnknownKind({ kind: "poll" })).toBe(false);
    expect(isUnknownKind({ kind: "event" })).toBe(true);
    expect(isUnknownKind({})).toBe(false);
  });

  it("names the plugin a message needs, and otherwise asks for an update", () => {
    expect(unknownKindNotice("plugin:now-playing:track")).toMatch(/now-playing plugin/);
    expect(unknownKindNotice("event")).toMatch(/newer version of Gryt/);
  });
});
