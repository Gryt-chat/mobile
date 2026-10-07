import { describe, expect, it } from "vitest";

import { CAPABILITY_REFRESH_MS, capabilityIsFresh, isBackground, loudConversations, mutedConversations, parsePushState, pushLevel, pushStep, tagFromResponse } from "./pushRules";

const TAG = "0123456789abcdef";

describe("tagFromResponse", () => {
  it("reads it from the content data", () => {
    expect(tagFromResponse({ notification: { request: { content: { data: { c: TAG } } } } })).toBe(TAG);
  });

  it("reads it from an APNs payload", () => {
    expect(tagFromResponse({ notification: { request: { content: { data: {} }, trigger: { type: "push", payload: { aps: {}, c: TAG } } } } })).toBe(TAG);
  });

  it("reads it from an FCM message", () => {
    expect(tagFromResponse({ notification: { request: { content: {}, trigger: { remoteMessage: { data: { c: TAG } } } } } })).toBe(TAG);
  });

  it("ignores anything that isn't a tag", () => {
    expect(tagFromResponse(null)).toBeNull();
    expect(tagFromResponse({ notification: { request: { content: { data: { c: "../evil" } } } } })).toBeNull();
  });
});

describe("parsePushState", () => {
  it("keeps what it recognises and drops the rest", () => {
    expect(parsePushState(JSON.stringify({ token: "t", caps: { "a.example": "p_x", bad: 3 }, issued: { "a.example": 5, gone: 6 } }))).toEqual({
      token: "t",
      caps: { "a.example": "p_x" },
      issued: { "a.example": 5 },
    });
    expect(parsePushState(null)).toEqual({ token: null, caps: {}, issued: {} });
    expect(parsePushState("{nope")).toEqual({ token: null, caps: {}, issued: {} });
  });
});

describe("pushLevel", () => {
  it("lets the quieter of the global and server levels decide", () => {
    expect(pushLevel({ global: "all", servers: {} }, "a")).toBe("all");
    expect(pushLevel({ global: "all", servers: { a: { server: "none" } } }, "a")).toBe("none");
    expect(pushLevel({ global: "none", servers: { a: { server: "all" } } }, "a")).toBe("none");
    expect(pushLevel({ global: "mentions", servers: {} }, "a")).toBe("mentions");
  });
});

describe("isBackground", () => {
  it("doesn't count a pulled-down control centre", () => {
    expect(isBackground("background")).toBe(true);
    expect(isBackground("inactive")).toBe(false);
    expect(isBackground("active")).toBe(false);
  });
});

describe("loudConversations", () => {
  const channels = [{ id: "general" }, { id: "quiet", defaultNotificationLevel: "mentions" as const }, { id: "news" }];

  it("lists the channels at All, which is every channel by default, like the desktop", () => {
    const prefs = { global: "all" as const, servers: {} };
    expect(loudConversations(prefs, "h", channels)).toEqual(["general", "news"]);
  });

  it("follows the phone's own choice over the server's default, both ways", () => {
    const prefs = { global: "all" as const, servers: { h: { channels: { quiet: "all" as const, news: "mentions" as const } } } };
    expect(loudConversations(prefs, "h", channels)).toEqual(["general", "quiet"]);
  });

  it("is empty when the server or everything is set to mentions", () => {
    expect(loudConversations({ global: "all", servers: { h: { server: "mentions" } } }, "h", channels)).toEqual([]);
    expect(loudConversations({ global: "mentions", servers: { h: { channels: { quiet: "all" } } } }, "h", channels)).toEqual([]);
  });

  it("never lists a muted channel", () => {
    const prefs = { global: "all" as const, servers: { h: { channels: { general: "none" as const } } } };
    expect(loudConversations(prefs, "h", channels)).toEqual(["news"]);
  });
});

describe("mutedConversations", () => {
  const channels = [{ id: "general" }, { id: "spam", defaultNotificationLevel: "none" as const }, { id: "news" }];

  it("lists channels muted here, by the server's default or the phone's own choice", () => {
    const prefs = { global: "all" as const, servers: { h: { channels: { news: "none" as const } } } };
    expect(mutedConversations(prefs, "h", channels)).toEqual(["news", "spam"]);
  });

  it("lets the phone turn a server-muted channel back on", () => {
    const prefs = { global: "all" as const, servers: { h: { channels: { spam: "mentions" as const } } } };
    expect(mutedConversations(prefs, "h", channels)).toEqual([]);
  });

  it("includes a muted direct message, which isn't in the channel list", () => {
    const prefs = { global: "all" as const, servers: { h: { channels: { "dm:abc": "none" as const } } } };
    expect(mutedConversations(prefs, "h", channels)).toEqual(["dm:abc", "spam"]);
  });

  it("mutes every channel when the server itself is at None", () => {
    const prefs = { global: "all" as const, servers: { h: { server: "none" as const } } };
    expect(mutedConversations(prefs, "h", channels)).toEqual(["general", "news", "spam"]);
  });
});

describe("pushStep", () => {
  const base = { level: "all" as const, choice: "yes" as const, osAllows: true, onScreen: false };

  it("registers only after a yes", () => {
    expect(pushStep(base)).toBe("register");
    expect(pushStep({ ...base, choice: undefined })).toBe("wait");
    expect(pushStep({ ...base, choice: undefined, onScreen: true })).toBe("ask");
  });

  it("takes it back for a no, a muted server, or the OS saying no", () => {
    expect(pushStep({ ...base, choice: "no" })).toBe("unregister");
    expect(pushStep({ ...base, level: "none" })).toBe("unregister");
    expect(pushStep({ ...base, osAllows: false })).toBe("unregister");
    expect(pushStep({ ...base, choice: undefined, onScreen: true, level: "none" })).toBe("unregister");
  });

  it("still pushes for a server at mentions only", () => {
    expect(pushStep({ ...base, level: "mentions" })).toBe("register");
  });
});

describe("capabilityIsFresh", () => {
  const state = { token: "t", caps: { a: "p_a", old: "p_old", legacy: "p_legacy" }, issued: { a: 1_000, old: 0 } };

  it("keeps one under thirty days and swaps an older one, or one from before this was recorded", () => {
    expect(capabilityIsFresh(state, "a", 1_000 + CAPABILITY_REFRESH_MS - 1)).toBe(true);
    expect(capabilityIsFresh(state, "a", 1_000 + CAPABILITY_REFRESH_MS)).toBe(false);
    expect(capabilityIsFresh(state, "legacy", 5_000)).toBe(false);
    expect(capabilityIsFresh(state, "missing", 5_000)).toBe(false);
  });
});
