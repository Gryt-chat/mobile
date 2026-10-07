import { describe, expect, it } from "vitest";

import { parseChoices } from "./pushChoice";

describe("parseChoices", () => {
  it("keeps yes and no, and drops anything else", () => {
    expect(parseChoices(JSON.stringify({ a: "yes", b: "no", c: "maybe", d: 1 }))).toEqual({ a: "yes", b: "no" });
    expect(parseChoices(null)).toEqual({});
    expect(parseChoices("{oops")).toEqual({});
  });
});
