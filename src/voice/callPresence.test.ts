import { describe, expect, it } from "vitest";

import { isInSameCall } from "./callPresence";

describe("isInSameCall", () => {
  it("is true when both are in the same channel", () => {
    expect(isInSameCall("lounge", "lounge")).toBe(true);
  });

  it("is false when you're not in a call at all", () => {
    expect(isInSameCall(null, "lounge")).toBe(false);
    expect(isInSameCall(undefined, "lounge")).toBe(false);
  });

  it("is false when they're in a different channel", () => {
    expect(isInSameCall("lounge", "study")).toBe(false);
  });

  it("is false when they aren't in a call at all", () => {
    expect(isInSameCall("lounge", null)).toBe(false);
    expect(isInSameCall("lounge", undefined)).toBe(false);
  });
});
