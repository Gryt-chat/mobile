import { describe, expect, it } from "vitest";

import { whoIsThere } from "./presence";

describe("whoIsThere", () => {
  it("names up to three people, and counts the rest", () => {
    const m = (...names: string[]) => names.map((nickname) => ({ nickname }));
    expect(whoIsThere(undefined)).toBe("");
    expect(whoIsThere(m("Al"))).toBe(" Al is there.");
    expect(whoIsThere(m("Al", "Justin", "Carlo"))).toBe(" Al, Justin and Carlo are there.");
    expect(whoIsThere(m("Al", "Justin", "Carlo", "Mira"))).toBe(" Al, Justin and 2 others are there.");
  });
});
