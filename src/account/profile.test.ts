import { describe, expect, it } from "vitest";

import { base64Url, utf8 } from "../identity/encoding";
import { profileFrom } from "./profile";

/** Shaped like Keycloak's, signed with nothing — only the claims are read. */
function token(payload: Record<string, unknown>): string {
  return [
    base64Url(utf8(JSON.stringify({ alg: "RS256", typ: "JWT" }))),
    base64Url(utf8(JSON.stringify(payload))),
    "not-a-real-signature",
  ].join(".");
}

describe("profileFrom", () => {
  it("prefers the username people chose", () => {
    expect(
      profileFrom(token({ sub: "abc", preferred_username: "sivert", name: "Sivert G", email: "s@x" })),
    ).toEqual({ sub: "abc", label: "sivert", email: "s@x" });
  });

  it("falls back through name, then email, then the subject", () => {
    expect(profileFrom(token({ sub: "abc", name: "Sivert G" }))?.label).toBe("Sivert G");
    expect(profileFrom(token({ sub: "abc", email: "s@x" }))?.label).toBe("s@x");
    expect(profileFrom(token({ sub: "abc" }))?.label).toBe("abc");
  });

  /* The subject is the only claim a Gryt identity is keyed on, so a token
   * without one names nobody — better to read as signed out than to draw a
   * blank row. */
  it("answers null without a subject", () => {
    expect(profileFrom(token({ preferred_username: "sivert" }))).toBeNull();
    expect(profileFrom(token({ sub: "" }))).toBeNull();
  });

  it("answers null rather than throwing on anything that is not a token", () => {
    expect(profileFrom("")).toBeNull();
    expect(profileFrom("not-a-jwt")).toBeNull();
    expect(profileFrom("a.!!!.c")).toBeNull();
  });

  it("ignores claims of the wrong type rather than rendering them", () => {
    expect(profileFrom(token({ sub: "abc", preferred_username: 42, email: false }))).toEqual({
      sub: "abc",
      label: "abc",
      email: undefined,
    });
  });
});
