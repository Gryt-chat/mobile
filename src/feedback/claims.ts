import { sha256 } from "@noble/hashes/sha2.js";

import { base64Url, utf8 } from "../identity/encoding";
import { jwkThumbprint, type PublicJwk } from "../identity/keys";

/**
 * The claim set a report assertion carries, and the two values in it that are
 * easy to get silently wrong.
 *
 * Pure and separate from `assertion.ts`, which reads the Keychain — vitest
 * cannot load a module that reaches React Native, and these are exactly the
 * parts worth having tests on: the service recomputes `sub` from the key in
 * the header and `bh` from the bytes it received, and disagreeing with it on
 * either is a 401 that says nothing useful.
 */

/** The scope this service's key is derived under, and its audience. */
export const REPORTS_SCOPE = "gryt:reports";

/**
 * Comfortably inside the service's five minutes, without being so tight that a
 * slow request expires in flight.
 */
const LIFETIME_SECONDS = 120;

export interface AssertionClaims {
  sub: string;
  aud: string;
  bh: string;
  jti: string;
  iat: number;
  exp: number;
}

/** base64url of the SHA-256 of the exact bytes that will be posted. */
export function bodyHash(body: string): string {
  return base64Url(sha256(utf8(body)));
}

/**
 * `sub` is the RFC 7638 thumbprint of the key in the header, which the service
 * recomputes and compares — a mismatch is what stops somebody attaching
 * somebody else's public key to their own signature.
 */
export function assertionClaims(
  jwk: PublicJwk,
  body: string,
  jti: string,
  now = Math.floor(Date.now() / 1000),
): AssertionClaims {
  return {
    sub: jwkThumbprint(jwk),
    aud: REPORTS_SCOPE,
    bh: bodyHash(body),
    jti,
    iat: now,
    exp: now + LIFETIME_SECONDS,
  };
}
