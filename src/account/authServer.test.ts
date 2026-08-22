import { describe, expect, it } from "vitest";

import {
  DEFAULT_IDENTITY_URL,
  DEFAULT_ISSUER,
  discoveryFor,
  isDefault,
  NO_OVERRIDE,
  normalizeAuthUrl,
  parseOverride,
  resolveAccountConfig,
  toOverride,
} from "./authServer";

describe("normalizeAuthUrl", () => {
  /* The issuer is string-compared against the `iss` claim in every token, so a
   * trailing slash is not cosmetic — it is a different value for the same
   * server, and every token then fails to validate. */
  it("drops the trailing slash, which is not cosmetic here", () => {
    expect(normalizeAuthUrl("https://auth.example.test/realms/gryt/")).toBe(
      "https://auth.example.test/realms/gryt",
    );
    expect(normalizeAuthUrl("https://auth.example.test/realms/gryt///")).toBe(
      "https://auth.example.test/realms/gryt",
    );
  });

  it("trims what somebody pasted", () => {
    expect(normalizeAuthUrl("  http://localhost:18080/realms/gryt  ")).toBe(
      "http://localhost:18080/realms/gryt",
    );
  });

  it("answers empty for nothing", () => {
    expect(normalizeAuthUrl("")).toBe("");
    expect(normalizeAuthUrl(null)).toBe("");
    expect(normalizeAuthUrl(undefined)).toBe("");
  });
});

describe("toOverride", () => {
  it("treats a cleared field as no override rather than as an empty one", () => {
    // Which is what makes emptying both fields the way back to Gryt's own.
    expect(toOverride({ issuer: "", identityUrl: "   " })).toEqual(NO_OVERRIDE);
  });

  it("keeps the two independent", () => {
    // Deliberately allowed even though it is GRYT-156 waiting to happen — the
    // screen is what refuses to save one alone, because a self-hoster running
    // Gryt's identity service against their own Keycloak is a real setup.
    expect(toOverride({ issuer: "https://kc.test/realms/gryt" })).toEqual({
      issuer: "https://kc.test/realms/gryt",
      identityUrl: null,
    });
  });
});

describe("parseOverride", () => {
  it("reads what was stored", () => {
    expect(
      parseOverride({ issuer: "https://kc.test/realms/gryt/", identityUrl: "https://id.test/" }),
    ).toEqual({ issuer: "https://kc.test/realms/gryt", identityUrl: "https://id.test" });
  });

  /* A blob written by a future version, or half-written by a crash, should
   * leave the app pointed at production rather than at nothing. */
  it("answers no override for anything that is not one", () => {
    expect(parseOverride(null)).toEqual(NO_OVERRIDE);
    expect(parseOverride("nonsense")).toEqual(NO_OVERRIDE);
    expect(parseOverride({})).toEqual(NO_OVERRIDE);
    expect(parseOverride({ issuer: 42, identityUrl: false })).toEqual(NO_OVERRIDE);
  });
});

describe("resolveAccountConfig", () => {
  it("is Gryt's own with nothing set", () => {
    const config = resolveAccountConfig(NO_OVERRIDE);

    expect(config.issuer).toBe(DEFAULT_ISSUER);
    expect(config.identityUrl).toBe(DEFAULT_IDENTITY_URL);
    expect(config.clientId).toBe("gryt-web");
    expect(config.redirectUri).toBe("gryt://auth/callback");
  });

  it("takes each override on its own", () => {
    expect(
      resolveAccountConfig({ issuer: "http://localhost:18080/realms/gryt", identityUrl: null })
        .issuer,
    ).toBe("http://localhost:18080/realms/gryt");

    // Still Gryt's, which is the state GRYT-156 was: a token from one Keycloak
    // posted to another's certificate authority.
    expect(
      resolveAccountConfig({ issuer: "http://localhost:18080/realms/gryt", identityUrl: null })
        .identityUrl,
    ).toBe(DEFAULT_IDENTITY_URL);
  });

  it("keeps the client id and the redirect, which are the app's and not the server's", () => {
    const config = resolveAccountConfig({
      issuer: "http://localhost:18080/realms/gryt",
      identityUrl: "http://localhost:18081",
    });

    expect(config.clientId).toBe("gryt-web");
    expect(config.redirectUri).toBe("gryt://auth/callback");
  });
});

describe("isDefault", () => {
  it("is true only when neither is set", () => {
    expect(isDefault(NO_OVERRIDE)).toBe(true);
    expect(isDefault({ issuer: "https://kc.test/realms/gryt", identityUrl: null })).toBe(false);
    expect(isDefault({ issuer: null, identityUrl: "https://id.test" })).toBe(false);
  });
});

describe("discoveryFor", () => {
  it("builds Keycloak's four endpoints under whatever realm it is given", () => {
    expect(discoveryFor("http://localhost:18080/realms/gryt")).toEqual({
      authorizationEndpoint: "http://localhost:18080/realms/gryt/protocol/openid-connect/auth",
      tokenEndpoint: "http://localhost:18080/realms/gryt/protocol/openid-connect/token",
      revocationEndpoint: "http://localhost:18080/realms/gryt/protocol/openid-connect/revoke",
      endSessionEndpoint: "http://localhost:18080/realms/gryt/protocol/openid-connect/logout",
    });
  });
});
