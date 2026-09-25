import { describe, expect, it } from "vitest";

import { closeDelay } from "./useSettledOpen";

describe("closeDelay", () => {
  it("holds a close until the opening has had its time", () => {
    expect(closeDelay(1_000, 1_050, 900)).toBe(850);
  });

  it("closes at once when the opening is done or never happened", () => {
    expect(closeDelay(1_000, 2_000, 900)).toBe(0);
    expect(closeDelay(null, 2_000, 900)).toBe(0);
  });
});
