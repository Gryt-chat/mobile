import { describe, expect, it } from "vitest";

import { base64UrlDecode } from "../identity/encoding";
import { deriveLocalKeyPair, jwkThumbprint, signJwt, verifyJwtSignature } from "../identity/keys";
import { assertionClaims, bodyHash, REPORTS_SCOPE } from "./claims";

/* The service verifies these with `jose`'s `EmbeddedJWK`: it takes the public
 * key out of the protected header, checks the signature, checks `sub` is that
 * key's RFC 7638 thumbprint, and checks `bh` is the sha256 of the exact bytes
 * posted. Every one of those is a way to be silently wrong, so every one has a
 * case here. */

const seed = new Uint8Array(32).map((_, i) => (i * 7 + 3) % 251);
const { privateKey, publicJwk } = deriveLocalKeyPair(seed, REPORTS_SCOPE);

function header(jwt: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(jwt.split(".")[0])));
}

describe("assertionClaims", () => {
  it("names the audience the service demands", () => {
    // A signature collected somewhere else — a server's join handshake — must
    // not be replayable here, and the audience is what stops it.
    expect(assertionClaims(publicJwk, "{}", "j").aud).toBe("gryt:reports");
  });

  it("is the thumbprint of the key that signs, which the service recomputes", () => {
    expect(assertionClaims(publicJwk, "{}", "j").sub).toBe(jwkThumbprint(publicJwk));
  });

  it("binds the exact body, so a different body is a different assertion", () => {
    const a = assertionClaims(publicJwk, '{"a":1}', "j").bh;
    const b = assertionClaims(publicJwk, '{"a":2}', "j").bh;

    expect(a).not.toBe(b);
    expect(a).toBe(bodyHash('{"a":1}'));
  });

  it("expires inside the service's five minutes", () => {
    const claims = assertionClaims(publicJwk, "{}", "j", 1000);

    expect(claims.iat).toBe(1000);
    expect(claims.exp).toBeGreaterThan(claims.iat);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);
  });
});

describe("the signed assertion", () => {
  it("carries the public key in the protected header, which is how it verifies", () => {
    const claims = assertionClaims(publicJwk, "{}", "j");
    const jwt = signJwt(claims as unknown as Record<string, unknown>, privateKey, {
      jwk: publicJwk,
    });

    expect(header(jwt)).toMatchObject({ alg: "ES256", typ: "JWT", jwk: publicJwk });
  });

  it("verifies against the key it carries", () => {
    const claims = assertionClaims(publicJwk, '{"type":"bug"}', "j");
    const jwt = signJwt(claims as unknown as Record<string, unknown>, privateKey, {
      jwk: publicJwk,
    });

    const [header, body, signature] = jwt.split(".");
    expect(
      verifyJwtSignature(`${header}.${body}`, base64UrlDecode(signature), publicJwk),
    ).toBe(true);
  });

  /* `alg` after the spread, so an extra header cannot quietly downgrade it. */
  it("cannot have its algorithm overridden by an extra header", () => {
    const jwt = signJwt({ a: 1 }, privateKey, { alg: "none", jwk: publicJwk });

    expect(header(jwt).alg).toBe("ES256");
  });
});

describe("the reports key", () => {
  /* The whole point of deriving one for this service: signing a report with a
   * per-server guest key would tell the service which server the reporter
   * uses, which is the disclosure the guest design exists to prevent. */
  it("is not any server's guest key", () => {
    const forAServer = deriveLocalKeyPair(seed, "gryt.example:5001");

    expect(jwkThumbprint(publicJwk)).not.toBe(jwkThumbprint(forAServer.publicJwk));
  });

  it("is the same key every time, so reports from one install tie together", () => {
    const again = deriveLocalKeyPair(seed, REPORTS_SCOPE);

    expect(jwkThumbprint(again.publicJwk)).toBe(jwkThumbprint(publicJwk));
  });
});
