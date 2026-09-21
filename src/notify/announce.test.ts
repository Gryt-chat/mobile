import { describe, expect, it } from "vitest";

import { announcesMessages } from "./announce";

describe("announcesMessages", () => {
  it("sounds for a channel the server set to everything", () => {
    expect(announcesMessages({ defaultNotificationLevel: "all" })).toBe(true);
  });

  it("stays quiet for one set to mentions or nothing, which is what an automated feed gets", () => {
    expect(announcesMessages({ defaultNotificationLevel: "mentions" })).toBe(false);
    expect(announcesMessages({ defaultNotificationLevel: "none" })).toBe(false);
  });

  it("reads an older server, which sends no level, as everything", () => {
    expect(announcesMessages({})).toBe(true);
    expect(announcesMessages(undefined)).toBe(true);
  });

  it("reads a level this build does not know as everything rather than silence", () => {
    expect(announcesMessages({ defaultNotificationLevel: "loud" as never })).toBe(true);
  });
});
