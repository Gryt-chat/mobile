import { describe, expect, it } from "vitest";

import { isBackground, parsePushState, pushLevel, tagFromResponse } from "./pushRules";

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
    expect(parsePushState(JSON.stringify({ token: "t", caps: { "a.example": "p_x", bad: 3 } }))).toEqual({ token: "t", caps: { "a.example": "p_x" } });
    expect(parsePushState(null)).toEqual({ token: null, caps: {} });
    expect(parsePushState("{nope")).toEqual({ token: null, caps: {} });
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
