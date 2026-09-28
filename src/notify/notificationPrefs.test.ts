import { describe, expect, it } from "vitest";

import {
  globalOverrules,
  inheritedLevel,
  parsePrefsByHost,
  parseStoredPrefs,
  quieterOf,
  resolveLevel,
  shouldAnnounceMention,
  shouldAnnounceMessage,
  type NotificationPrefsByHost,
} from "./notificationPrefs";

describe("quieterOf", () => {
  it("picks whichever of two levels says less", () => {
    expect(quieterOf("all", "mentions")).toBe("mentions");
    expect(quieterOf("none", "all")).toBe("none");
    expect(quieterOf("mentions", "mentions")).toBe("mentions");
  });
});

describe("globalOverrules", () => {
  it("is true only when the ceiling is stricter than the resolved answer", () => {
    expect(globalOverrules("mentions", "all")).toBe(true);
    expect(globalOverrules("all", "mentions")).toBe(false);
    expect(globalOverrules("none", "none")).toBe(false);
  });
});

describe("parsePrefsByHost", () => {
  it("drops a level this build does not know", () => {
    expect(parsePrefsByHost({ "a.example": { server: "loud" } })).toEqual({});
  });

  it("keeps a server and channel level together", () => {
    expect(
      parsePrefsByHost({ "a.example": { server: "mentions", channels: { c1: "none" } } }),
    ).toEqual({ "a.example": { server: "mentions", channels: { c1: "none" } } });
  });

  it("drops an empty channel bag rather than keeping an empty object", () => {
    expect(parsePrefsByHost({ "a.example": { channels: { c1: "loud" as never } } })).toEqual({});
  });
});

describe("parseStoredPrefs", () => {
  it("reads unset or unreadable as everything, globally", () => {
    expect(parseStoredPrefs(null)).toEqual({ global: "all", servers: {} });
    expect(parseStoredPrefs("garbage")).toEqual({ global: "all", servers: {} });
  });

  it("reads the global level alongside the per-server map", () => {
    expect(parseStoredPrefs({ global: "none", servers: { "a.example": { server: "all" } } })).toEqual({
      global: "none",
      servers: { "a.example": { server: "all" } },
    });
  });
});

describe("resolveLevel", () => {
  const prefs: NotificationPrefsByHost = {
    "a.example": { server: "mentions", channels: { c1: "all" } },
  };

  it("takes a channel's own answer over anything it would inherit", () => {
    expect(resolveLevel(prefs, "a.example", { channelId: "c1" })).toBe("all");
  });

  it("falls back to the server's answer, quietened by the channel's own default", () => {
    expect(resolveLevel(prefs, "a.example", { channelId: "c2", defaultLevel: "all" })).toBe("mentions");
    expect(resolveLevel(prefs, "a.example", { channelId: "c2", defaultLevel: "none" })).toBe("none");
  });

  it("reads everything for a server with no answer at all", () => {
    expect(resolveLevel({}, "b.example", { channelId: "c1" })).toBe("all");
    expect(resolveLevel({}, "b.example", null)).toBe("all");
  });
});

describe("inheritedLevel", () => {
  it("ignores the channel's own answer, unlike resolveLevel", () => {
    const prefs: NotificationPrefsByHost = { "a.example": { server: "all", channels: { c1: "none" } } };
    expect(inheritedLevel(prefs, "a.example", { channelId: "c1" })).toBe("all");
  });
});

describe("shouldAnnounceMessage / shouldAnnounceMention", () => {
  it("only \"all\" announces a plain message", () => {
    expect(shouldAnnounceMessage("all")).toBe(true);
    expect(shouldAnnounceMessage("mentions")).toBe(false);
    expect(shouldAnnounceMessage("none")).toBe(false);
  });

  it("\"mentions\" still announces a mention", () => {
    expect(shouldAnnounceMention("all")).toBe(true);
    expect(shouldAnnounceMention("mentions")).toBe(true);
    expect(shouldAnnounceMention("none")).toBe(false);
  });
});
