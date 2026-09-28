import { describe, expect, it } from "vitest";

import { announcesMessages, isChannelMuted } from "./announce";

const HOST = "example.test";

describe("announcesMessages", () => {
  it("sounds for a channel the server set to everything", () => {
    expect(announcesMessages(HOST, { id: "c1", defaultNotificationLevel: "all" })).toBe(true);
  });

  it("stays quiet for one set to mentions or nothing, which is what an automated feed gets", () => {
    expect(announcesMessages(HOST, { id: "c1", defaultNotificationLevel: "mentions" })).toBe(false);
    expect(announcesMessages(HOST, { id: "c1", defaultNotificationLevel: "none" })).toBe(false);
  });

  it("reads an older server, which sends no level, as everything", () => {
    expect(announcesMessages(HOST, { id: "c1" })).toBe(true);
    expect(announcesMessages(HOST, undefined)).toBe(true);
  });

  it("reads a level this build does not know as everything rather than silence", () => {
    expect(announcesMessages(HOST, { id: "c1", defaultNotificationLevel: "loud" as never })).toBe(true);
  });
});

describe("isChannelMuted", () => {
  it("is muted only at \"none\", not at \"mentions\"", () => {
    expect(isChannelMuted(HOST, { id: "c1", defaultNotificationLevel: "none" })).toBe(true);
    expect(isChannelMuted(HOST, { id: "c1", defaultNotificationLevel: "mentions" })).toBe(false);
    expect(isChannelMuted(HOST, { id: "c1", defaultNotificationLevel: "all" })).toBe(false);
  });

  it("reads no level, or none this build knows, as unmuted", () => {
    expect(isChannelMuted(HOST, { id: "c1" })).toBe(false);
    expect(isChannelMuted(HOST, undefined)).toBe(false);
    expect(isChannelMuted(HOST, { id: "c1", defaultNotificationLevel: "loud" as never })).toBe(false);
  });
});
