import { mapHashToField } from "@noble/curves/abstract/modular.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { base64Url, base64UrlDecode, utf8 } from "./encoding";

/* The identity keys, derived the way the desktop client derives them.
 *
 * **Every constant in this file has to be byte-identical to the web client's.**
 * If they are not, the same seed produces a different key, which produces a
 * different `sub`, and the server sees a stranger rather than you: no roles, no
 * ownership, no history. `keys.test.ts` checks that against vectors generated
 * from the client's own dependencies rather than from this implementation.
 *
 * The client does the curve work with `@noble/curves` and the JWK import and
 * signing with WebCrypto. React Native has no WebCrypto, so this does all of it
 * with `@noble/curves` — which is not a downgrade: the client's own comment says
 * WebCrypto "will not multiply a scalar by the curve's base point", so noble was
 * already doing the part that matters.
 */

/** Length of the seed every local identity is calculated from. */
export const SEED_BYTES = 32;

/**
 * Domain separator mixed into every derivation, and the reason it carries a
 * version.
 *
 * Changing this string changes every key it has ever produced, which means
 * every local identity on every server at once. So it is versioned rather than
 * edited: a `v2` would have to arrive alongside a migration that carries
 * identities over, not on its own.
 */
const DERIVATION_SALT = "gryt-identity-v1";

/**
 * How many bytes to pull out of HKDF before reducing to a scalar.
 *
 * The order of P-256 is 32 bytes, and reducing exactly 32 bytes modulo it would
 * make the low values fractionally more likely than the high ones. Taking 16
 * more pushes that bias below anything measurable — the "extra random bits"
 * method from FIPS 186-4 B.4.1, which is what `mapHashToField` implements.
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
 * Reject a seed that is obviously not random.
 *
 * This cannot detect a generator that is subtly weak and is not trying to. What
 * it catches is the loud version — a stub, a mock left in by accident, or a
 * platform returning a constant — where every device derives the same keys and
 * every user is silently the same person. A real seed being all one byte has a
 * probability of about 2^-248, so there is no honest case to lose here.
 */
export function assertUsableSeed(seed: Uint8Array): void {
  if (seed.length !== SEED_BYTES) {
    throw new Error(`An identity seed is ${SEED_BYTES} bytes, not ${seed.length}.`);
  }
  const first = seed[0];
  if (seed.every((b) => b === first)) {
    throw new Error("Identity seed is a single repeated byte — the generator is broken.");
  }
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
 * Sign a JWT with ES256.
 *
 * `prehash: true` because ES256 signs the SHA-256 of the signing input rather
 * than the input itself, and noble otherwise expects a digest already.
 *
 * `p256.sign` returns the raw 64-byte r‖s pair, which is exactly what JWS
 * wants. It is worth being explicit about that because the other thing it
 * could plausibly return is DER — about 70 bytes, starting 0x30 — and a server
 * would reject every assertion signed that way. `keys.test.ts` asserts the
 * length for that reason.
 */
export function signJwt(
  payload: Record<string, unknown>,
  privateKey: Uint8Array,
): string {
  const header = base64Url(utf8(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const body = base64Url(utf8(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;

  const signature = p256.sign(utf8(signingInput), privateKey, { prehash: true });

  return `${signingInput}.${base64Url(signature)}`;
}

/** Verify an ES256 JWT's signature against a public JWK. Used for the server's
 *  own proof, which is the half that stops an impersonated server. */
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
    return p256.verify(signature, utf8(signingInput), point, { prehash: true });
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
