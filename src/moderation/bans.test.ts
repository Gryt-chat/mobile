import { describe, expect, it } from "vitest";

import { describeAttribution, describeDuration, displayName, toRows, type BanRecord } from "./bans";

const ban = (over: Partial<BanRecord> = {}): BanRecord => ({
  gryt_user_id: "faac5a86-0b7a-4852-b7fe-efd7cb8b4488",
  banned_by_server_user_id: "user_1",
  reason: null,
  created_at: "2026-08-14T10:00:00.000Z",
  expires_at: null,
  nickname: null,
  banned_by_nickname: null,
  ...over,
});

describe("displayName", () => {
  it("uses the nickname when there is one", () => {
    expect(displayName(ban({ nickname: "Ada" }))).toEqual({ title: "Ada", named: true });
  });

  it("shortens the subject when the membership row is gone", () => {
    const { title, named } = displayName(ban());
    expect(named).toBe(false);
    expect(title).toBe("faac5a86…4488");
  });

  it("treats a blank nickname as no nickname", () => {
    expect(displayName(ban({ nickname: "   " })).named).toBe(false);
  });

  it("does not shorten an id that is already short", () => {
    expect(displayName(ban({ gryt_user_id: "key:abc" })).title).toBe("key:abc");
  });
});

describe("describeDuration", () => {
  it("says permanent when nothing expires it", () => {
    expect(describeDuration(ban())).toBe("Permanent");
  });

  it("names the day it lifts", () => {
    expect(describeDuration(ban({ expires_at: "2026-09-20T10:00:00.000Z" }))).toMatch(/^Until /);
  });

  /* A date the runtime cannot parse must not become "Until Invalid Date". */
  it("falls back to permanent on an unparseable expiry", () => {
    expect(describeDuration(ban({ expires_at: "not a date" }))).toBe("Permanent");
  });
});

describe("describeAttribution", () => {
  it("names the moderator and the day", () => {
    expect(describeAttribution(ban({ banned_by_nickname: "Sivert" }))).toMatch(/^Banned by Sivert on /);
  });

  it("drops the moderator when they have left", () => {
    expect(describeAttribution(ban())).toMatch(/^Banned on /);
  });

  it("says the least it can rather than nothing", () => {
    expect(describeAttribution(ban({ created_at: "" }))).toBe("Banned");
  });
});

describe("toRows", () => {
  it("keeps the server's order", () => {
    const rows = toRows([ban({ nickname: "Ada" }), ban({ nickname: "Bo" })]);
    expect(rows.map((r) => r.title)).toEqual(["Ada", "Bo"]);
  });

  it("blanks a reason that is only whitespace", () => {
    expect(toRows([ban({ reason: "  " })])[0].reason).toBeNull();
  });

  it("carries the id through, which is what unban needs", () => {
    expect(toRows([ban()])[0].grytUserId).toBe("faac5a86-0b7a-4852-b7fe-efd7cb8b4488");
  });
});
