import { assertUsableSeed, SEED_BYTES } from "@gryt/crypto";

export { assertUsableSeed, SEED_BYTES };
import { mapHashToField } from "@noble/curves/abstract/modular.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { base64Url, base64UrlDecode, utf8 } from "./encoding";

/* The identity keys, derived the way the desktop does. Every constant here has to be
 * byte-identical to the web client's, or the same seed produces a different `sub`. */

/** Length of the seed every local identity is calculated from. */

/**
 * Domain separator mixed into every derivation. **Changing this string changes every
 * local identity on every server at once.**
 */
const DERIVATION_SALT = "gryt-identity-v1";

/**
 * How many bytes to pull out of HKDF before reducing to a scalar. 16 more than the
 * order needs, which is FIPS 186-4 B.4.1's extra-random-bits method.
 */
const OKM_BYTES = 48;

export interface PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

export interface LocalKeyPair {
  /** The private scalar. Never leaves this device. */
  privateKey: Uint8Array;
  publicJwk: PublicJwk;
}


/**
 * The keypair this seed gives for one server. Deterministic on any device, whether
 * or not that host has been seen — which is what makes a phrase restore work.
 */
export function deriveLocalKeyPair(seed: Uint8Array, host: string): LocalKeyPair {
  assertUsableSeed(seed);

  const okm = hkdf(sha256, seed, utf8(DERIVATION_SALT), utf8(host), OKM_BYTES);
  const scalar = mapHashToField(okm, p256.Point.Fn.ORDER);

  // Uncompressed, so the coordinates can be sliced straight out: a 0x04 tag,
  // then x, then y.
  const point = p256.getPublicKey(scalar, false);

  return {
    privateKey: scalar,
    publicJwk: {
      kty: "EC",
      crv: "P-256",
      x: base64Url(point.subarray(1, 33)),
      y: base64Url(point.subarray(33, 65)),
    },
  };
}

/**
 * RFC 7638 thumbprint. The member order below is required, not stylistic: the hash is
 * over canonical JSON with keys in lexicographic order and no whitespace.
 */
export function jwkThumbprint(jwk: PublicJwk): string {
  if (jwk.kty !== "EC" || !jwk.crv || !jwk.x || !jwk.y) {
    throw new Error("Not an EC public JWK");
  }
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  return base64Url(sha256(utf8(canonical)));
}

/** What a local identity calls itself. The server derives this itself and
 *  ignores whatever a certificate claims, which is what makes it safe. */
export function subjectFor(jwk: PublicJwk): string {
  return `key:${jwkThumbprint(jwk)}`;
}

/**
 * Sign a JWT with ES256. **`prehash: true`**, because ES256 signs the SHA-256 of the
 * input. `p256.sign` returns the raw 64-byte r‖s pair JWS wants, not DER.
 */
export function signJwt(
  payload: Record<string, unknown>,
  privateKey: Uint8Array,
  /**
   * Extra protected header members, for an assertion whose verifier takes the key
   * from the header. **`alg` and `typ` are applied after**, so this cannot downgrade.
   */
  extraHeader?: Record<string, unknown>,
): string {
  const header = base64Url(
    utf8(JSON.stringify({ ...extraHeader, alg: "ES256", typ: "JWT" })),
  );
  const body = base64Url(utf8(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;

  const signature = p256.sign(utf8(signingInput), privateKey, { prehash: true });

  return `${signingInput}.${base64Url(signature)}`;
}

/**
 * Verify an ES256 JWT's signature against a public JWK. `lowS: false` is load-bearing:
 * noble takes only the smaller valid `s` by default, and JWS has no such rule.
 */
export function verifyJwtSignature(
  signingInput: string,
  signature: Uint8Array,
  jwk: PublicJwk,
): boolean {
  try {
    const point = new Uint8Array(65);
    point[0] = 0x04;
    point.set(base64UrlToBytes(jwk.x), 1);
    point.set(base64UrlToBytes(jwk.y), 33);
    return p256.verify(signature, utf8(signingInput), point, {
      prehash: true,
      lowS: false,
    });
  } catch {
    // A malformed key or signature is a failed verification, not a crash. The
    // caller cannot tell the difference and should not act differently.
    return false;
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const bytes = base64UrlDecode(value);
  if (bytes.length !== 32) throw new Error("Coordinate is not 32 bytes");
  return bytes;
}
