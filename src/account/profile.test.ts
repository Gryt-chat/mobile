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
    ).toEqual({ sub: "abc", label: "sivert", displayName: "sivert", email: "s@x" });
  });

  it("falls back through name, then email, then the subject", () => {
    expect(profileFrom(token({ sub: "abc", name: "Sivert G" }))?.label).toBe("Sivert G");
    expect(profileFrom(token({ sub: "abc", email: "s@x" }))?.label).toBe("s@x");
    expect(profileFrom(token({ sub: "abc" }))?.label).toBe("abc");
  });

  /* GRYT-500. `label` answers "which account is this", where the email is the
   * right answer. `displayName` answers "what is this person called", where it
   * is not — your own email turning up where your name was reads as a leak. */
  describe("displayName", () => {
    it("is the chosen name, and nothing else", () => {
      expect(profileFrom(token({ sub: "abc", name: "Sivert G" }))?.displayName).toBe(
        "Sivert G",
      );
    });

    it("is undefined when the account has only an email", () => {
      const profile = profileFrom(token({ sub: "abc", email: "s@x" }));
      expect(profile?.displayName).toBeUndefined();
      expect(profile?.label).toBe("s@x");
    });

    it("is undefined when Keycloak copied the email into the username", () => {
      // Which it does for anybody who registered with an email address, so
      // this is the ordinary case rather than an odd one.
      expect(
        profileFrom(token({ sub: "abc", preferred_username: "s@x", email: "s@x" }))
          ?.displayName,
      ).toBeUndefined();
    });

    it("takes the real name when the username is the email", () => {
      expect(
        profileFrom(
          token({ sub: "abc", preferred_username: "s@x", name: "Sivert G", email: "s@x" }),
        )?.displayName,
      ).toBe("Sivert G");
    });

    it("is undefined when there is nothing but a subject", () => {
      expect(profileFrom(token({ sub: "abc" }))?.displayName).toBeUndefined();
    });
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
      displayName: undefined,
      email: undefined,
    });
  });
});
