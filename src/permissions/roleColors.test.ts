import { describe, expect, it } from "vitest";

import { nextUnusedPreset, ROLE_COLOR_PRESETS } from "./roleColors";

describe("nextUnusedPreset", () => {
  it("picks the first preset when none are taken", () => {
    expect(nextUnusedPreset([])).toBe(ROLE_COLOR_PRESETS[0].value);
  });

  it("skips a colour already in use, case-insensitively", () => {
    expect(nextUnusedPreset([ROLE_COLOR_PRESETS[0].value.toUpperCase()])).toBe(ROLE_COLOR_PRESETS[1].value);
  });

  it("ignores null and undefined entries", () => {
    expect(nextUnusedPreset([null, undefined])).toBe(ROLE_COLOR_PRESETS[0].value);
  });

  it("wraps once every preset is taken", () => {
    const all = ROLE_COLOR_PRESETS.map((p) => p.value);
    expect(nextUnusedPreset(all)).toBe(ROLE_COLOR_PRESETS[0].value);
  });
});
