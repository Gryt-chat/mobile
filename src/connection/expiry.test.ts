import { describe, expect, it } from "vitest";

import { base64Url, utf8 } from "../identity/encoding";
import { REFRESH_MARGIN_MS, msUntilRefresh, shouldRefresh, tokenExpiryMs } from "./expiry";

/** A token shaped like the server's, signed with nothing — only `exp` is read. */
function token(payload: Record<string, unknown>): string {
  return [
    base64Url(utf8(JSON.stringify({ alg: "HS256", typ: "JWT" }))),
    base64Url(utf8(JSON.stringify(payload))),
    "not-a-real-signature",
  ].join(".");
}

const NOW = 1_700_000_000_000;
const inSeconds = (s: number) => Math.floor(NOW / 1000) + s;

describe("tokenExpiryMs", () => {
  it("reads exp as milliseconds", () => {
    expect(tokenExpiryMs(token({ exp: 1700 }))).toBe(1_700_000);
  });

  it("answers null for a token with no exp", () => {
    expect(tokenExpiryMs(token({ sub: "someone" }))).toBeNull();
  });

  it("answers null rather than throwing on rubbish", () => {
    expect(tokenExpiryMs("not-a-jwt")).toBeNull();
    expect(tokenExpiryMs("")).toBeNull();
    expect(tokenExpiryMs("a.!!!.c")).toBeNull();
  });

  it("ignores a non-numeric exp", () => {
    expect(tokenExpiryMs(token({ exp: "soon" }))).toBeNull();
  });
});

describe("shouldRefresh", () => {
  it("leaves a fresh token alone", () => {
    // Fifteen minutes out, which is what the server issues.
    expect(shouldRefresh(token({ exp: inSeconds(15 * 60) }), NOW)).toBe(false);
  });

  it("refreshes inside the margin", () => {
    expect(shouldRefresh(token({ exp: inSeconds(4 * 60) }), NOW)).toBe(true);
  });

  it("refreshes one already expired", () => {
    expect(shouldRefresh(token({ exp: inSeconds(-60) }), NOW)).toBe(true);
  });

  it("treats an unreadable token as due", () => {
    // Refreshing needlessly costs a round trip; trusting an unreadable token
    // costs a session that dies mid-use.
    expect(shouldRefresh("not-a-jwt", NOW)).toBe(true);
  });

  it("is exactly the margin at the boundary", () => {
    const exp = Math.floor((NOW + REFRESH_MARGIN_MS) / 1000);
    expect(shouldRefresh(token({ exp }), NOW)).toBe(false);
    expect(shouldRefresh(token({ exp }), NOW + 1000)).toBe(true);
  });
});

describe("msUntilRefresh", () => {
  it("waits until the margin", () => {
    expect(msUntilRefresh(token({ exp: inSeconds(15 * 60) }), NOW)).toBe(10 * 60 * 1000);
  });

  it("says now when it is already due", () => {
    expect(msUntilRefresh(token({ exp: inSeconds(60) }), NOW)).toBeNull();
    expect(msUntilRefresh(token({ exp: inSeconds(-60) }), NOW)).toBeNull();
  });

  it("says now for a token it cannot read", () => {
    expect(msUntilRefresh("not-a-jwt", NOW)).toBeNull();
  });

  it("caps an absurd expiry so the timer does not wrap", () => {
    // setTimeout takes a 32-bit delay. Without the cap this fires immediately,
    // in a loop, forever.
    const delay = msUntilRefresh(token({ exp: inSeconds(60 * 60 * 24 * 365 * 100) }), NOW);
    expect(delay).toBeLessThanOrEqual(2_147_483_000);
    expect(delay).toBeGreaterThan(0);
  });
});
