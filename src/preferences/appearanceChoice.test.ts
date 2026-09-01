import { describe, expect, it } from "vitest";

import { resolveAppearance } from "./appearanceChoice";

/* The answers that are not "light" or "dark" are the ones that matter.
 * `useColorScheme()` is null before the OS has answered — on Android that is the
 * first frame of a cold start, not an edge case — and its type admits
 * "unspecified" too. A resolver that treated either as light would flash white
 * on every launch of a dark app. GRYT-813. */

describe("resolveAppearance", () => {
  it("takes an explicit choice over the phone", () => {
    expect(resolveAppearance("dark", "light")).toBe("dark");
    expect(resolveAppearance("light", "dark")).toBe("light");
  });

  it("follows the phone when the choice is system", () => {
    expect(resolveAppearance("system", "light")).toBe("light");
    expect(resolveAppearance("system", "dark")).toBe("dark");
  });

  it("falls to dark for every answer that is not light", () => {
    expect(resolveAppearance("system", null)).toBe("dark");
    expect(resolveAppearance("system", undefined)).toBe("dark");
    expect(resolveAppearance("system", "unspecified")).toBe("dark");
  });

  it("keeps an explicit choice even then", () => {
    expect(resolveAppearance("light", null)).toBe("light");
  });
});
