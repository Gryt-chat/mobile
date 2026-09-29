import { describe, expect, it } from "vitest";

import { activityLines, elapsedShort } from "./activityLine";
import type { Member } from "./types";

const NOW = 10_000_000_000;
const member = (over: Partial<Member>): Member => ({ serverUserId: "u1", nickname: "Alice", status: "online", ...over });

describe("what somebody is doing, on the phone", () => {
  it("reads a game's card as a headline and one detail line", () => {
    const lines = activityLines(
      member({
        activity: "World of Warcraft",
        richActivity: { type: "playing", name: "World of Warcraft", details: "Thragg - Level 14 Warlock", state: "Westfall", party: { size: 2, max: 5 }, startedAt: NOW - 26 * 60_000 },
      }),
      NOW,
    );
    expect(lines).toEqual({ headline: "Playing World of Warcraft", detail: "Thragg - Level 14 Warlock · Westfall · 2 of 5 · 26 min" });
  });

  it("uses the verb for the activity type", () => {
    expect(activityLines(member({ richActivity: { type: "listening", name: "Spotify" } }), NOW)?.headline).toBe("Listening to Spotify");
  });

  it("falls back to the typed status, with no detail line", () => {
    expect(activityLines(member({ activity: "deep work" }), NOW)).toEqual({ headline: "deep work", detail: null });
  });

  it("says nothing for somebody offline, or doing nothing", () => {
    expect(activityLines(member({ status: "offline", activity: "left over" }), NOW)).toBeNull();
    expect(activityLines(member({}), NOW)).toBeNull();
  });
});

describe("how long for", () => {
  it("is minutes, then hours and minutes", () => {
    expect(elapsedShort(NOW - 30_000, NOW)).toBe("just started");
    expect(elapsedShort(NOW - 12 * 60_000, NOW)).toBe("12 min");
    expect(elapsedShort(NOW - 65 * 60_000, NOW)).toBe("1 h 5 min");
  });

  it("is nothing for a start in the future or no start", () => {
    expect(elapsedShort(NOW + 1000, NOW)).toBeNull();
    expect(elapsedShort(undefined, NOW)).toBeNull();
  });
});
