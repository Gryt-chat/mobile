import { describe, expect, it } from "vitest";

import { endsInText, nextPicks, pollPercent } from "./polls";

describe("nextPicks", () => {
  it("swaps on a single-answer poll, and keeps your pick when you press it again", () => {
    expect(nextPicks({ multi: false }, [], 2)).toEqual([2]);
    expect(nextPicks({ multi: false }, [0], 1)).toEqual([1]);
    expect(nextPicks({ multi: false }, [1], 1)).toEqual([1]);
  });
  it("toggles on a multi-answer poll", () => {
    expect(nextPicks({ multi: true }, [2], 0)).toEqual([0, 2]);
    expect(nextPicks({ multi: true }, [0, 2], 2)).toEqual([0]);
  });
});

describe("pollPercent", () => {
  it("is of voters, so a multi-answer poll can add up past 100", () => {
    expect(pollPercent(3, 3)).toBe(100);
    expect(pollPercent(1, 3)).toBe(33);
    expect(pollPercent(0, 0)).toBe(0);
  });
});

describe("endsInText", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const later = (ms: number) => new Date(now + ms).toISOString();
  it("counts down in minutes, hours and days", () => {
    expect(endsInText(null, now)).toBeNull();
    expect(endsInText(later(-1000), now)).toBeNull();
    expect(endsInText(later(40 * 60_000), now)).toBe("ends in 40 minutes");
    expect(endsInText(later(24 * 3600_000), now)).toBe("ends in 1 day");
  });
});
