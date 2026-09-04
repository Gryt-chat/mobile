import { assertUsableSeed, SEED_BYTES } from "@gryt/crypto";

export { assertUsableSeed, SEED_BYTES };
import { mapHashToField } from "@noble/curves/abstract/modular.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { base64Url, base64UrlDecode, utf8 } from "./encoding";

/* The identity keys, derived the way the desktop client derives them.
 *
 * **Every constant in this file has to be byte-identical to the web client's.**
 * Otherwise the same seed produces a different key and a different `sub`, and
 * the server sees a stranger: no roles, no ownership, no history.
 * `keys.test.ts` checks that against vectors generated from the client's own
 * dependencies rather than from this implementation.
 *
 * React Native has no WebCrypto, so the JWK import and signing go through
 * `@noble/curves` too — not a downgrade, since noble was already doing the
 * curve work on both sides.
 */

/** Length of the seed every local identity is calculated from. */

/**
 * Domain separator mixed into every derivation. **Changing this string changes
 * every local identity on every server at once**, so a `v2` arrives alongside a
 * migration or not at all.
 */
const DERIVATION_SALT = "gryt-identity-v1";

/**
 * How many bytes to pull out of HKDF before reducing to a scalar. Reducing
 * exactly 32 makes low values fractionally likelier; 16 more pushes the bias
 * below anything measurable — FIPS 186-4 B.4.1, which `mapHashToField` does.
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
 * The keypair this seed gives for one server.
 *
 * Deterministic: the same seed and host always produce the same key, on any
 * device, whether or not that host has ever been seen before. That is what lets
 * a person restore an identity from a phrase rather than from a backup.
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
 * RFC 7638 thumbprint.
 *
 * The member order below is required, not stylistic: the hash is taken over a
 * canonical JSON object with keys in lexicographic order and no whitespace. Get
 * it wrong and every thumbprint silently disagrees with the server's.
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
 * Sign a JWT with ES256. **`prehash: true`** because ES256 signs the SHA-256 of
 * the signing input and noble otherwise expects a digest.
 *
 * `p256.sign` returns the raw 64-byte r‖s pair JWS wants — the alternative is
 * DER, about 70 bytes starting 0x30, which a server rejects. `keys.test.ts`
 * asserts the length.
 */
export function signJwt(
  payload: Record<string, unknown>,
  privateKey: Uint8Array,
  /**
   * Extra protected header members, for an assertion whose verifier takes the
   * key from the header — `jwk`, which `jose`'s `EmbeddedJWK` reads. **`alg`
   * and `typ` are applied after**, so this cannot downgrade the algorithm.
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
 * Verify an ES256 JWT's signature against a public JWK — the server's own
 * proof, which is the half that stops an impersonated server.
 *
 * **`lowS: false` is load-bearing.** Without it this refused half of all
 * genuine servers, at random, with the wording reserved for an impostor: noble
 * accepts only the smaller of the two valid forms of `s` by default, which is
 * right for Bitcoin and has no equivalent rule in JWS.
 *
 * Nothing is lost by accepting both. Malleability matters when a signature is
 * an identifier; here it is checked once and discarded.
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
