import { describe, expect, it } from "vitest";

import { buildLocalIdentity, signIdentityLink } from "./certificate";
import { base64UrlDecode, fromHex } from "./encoding";
import { deriveLocalKeyPair, subjectFor } from "./keys";

/* The same fixed seed the key vectors use, so the derived subject is stable and
 * a change to the derivation shows up here as well as there. */
const SEED = fromHex("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20");

function identity(host = "gryt.chat") {
  const { publicJwk, privateKey } = deriveLocalKeyPair(SEED, host);
  return buildLocalIdentity(publicJwk, privateKey);
}

/* Decoded here rather than through `connection/claims`, which reaches
 * react-native by way of the modules around it and cannot be loaded in Node. */
function decodeJwt<T>(jwt: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(jwt.split(".")[1]))) as T;
}

interface LinkClaims {
  iss?: string;
  aud?: string;
  nonce?: string;
  link_to?: string;
  jwk?: { x?: string; y?: string; crv?: string; kty?: string };
  iat?: number;
  exp?: number;
}

describe("signIdentityLink", () => {
  it("carries everything the server dispatches and checks on", () => {
    const me = identity();
    const link = signIdentityLink(me, "gryt.chat", "nonce-from-server", "gryt:account:abc", 1000);
    const claims = decodeJwt<LinkClaims>(link);

    expect(claims.iss).toBe("gryt:link");
    expect(claims.aud).toBe("gryt.chat");
    expect(claims.nonce).toBe("nonce-from-server");
    expect(claims.link_to).toBe("gryt:account:abc");
    expect(claims.iat).toBe(1000);
    expect(claims.exp).toBe(1060);
  });

  /* The server derives the prior subject from this key rather than reading a
   * claim, which is what stops a link naming somebody else's identity. So the
   * key in here has to be the one whose membership is being claimed. */
  it("carries the local public key, which is what the prior subject comes from", () => {
    const me = identity();
    const claims = decodeJwt<LinkClaims>(
      signIdentityLink(me, "gryt.chat", "n", "gryt:account:abc"),
    );

    expect(claims.jwk).toMatchObject({
      kty: me.publicJwk.kty,
      crv: me.publicJwk.crv,
      x: me.publicJwk.x,
      y: me.publicJwk.y,
    });
    // And that key is exactly the one the local membership was filed under.
    expect(subjectFor(claims.jwk as never)).toBe(me.sub);
  });

  it("is bound to one server and one nonce", () => {
    const me = identity();
    const a = decodeJwt<LinkClaims>(signIdentityLink(me, "a.example", "n1", "acct"));
    const b = decodeJwt<LinkClaims>(signIdentityLink(me, "b.example", "n2", "acct"));

    expect(a.aud).not.toBe(b.aud);
    expect(a.nonce).not.toBe(b.nonce);
  });

  /* Different hosts derive different keys, so a link proved for one server
   * names a different prior identity on another — the audience is not the only
   * thing keeping these apart. */
  it("names a different prior identity per host", () => {
    const one = identity("a.example");
    const two = identity("b.example");
    expect(one.sub).not.toBe(two.sub);
  });
});
