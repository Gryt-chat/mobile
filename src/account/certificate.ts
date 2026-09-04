import { decodeJwt } from "../connection/claims";
import type { PublicJwk } from "../identity/keys";

/* Fetching and holding the certificate that says a Gryt account holds this
 * device's key.
 *
 * Pure except for the `fetch`, which is passed in — the interesting parts are
 * deciding whether a certificate is still usable, and those are worth testing
 * without a network or a Keychain in the way.
 */

/** Renew a day early, as the desktop client does. */
export const RENEW_BUFFER_MS = 24 * 60 * 60 * 1000;

export interface StoredCertificate {
  certificate: string;
  /** Milliseconds. Read from the certificate rather than trusted from elsewhere. */
  expiresAt: number;
}

interface CertificateClaims {
  sub?: string;
  exp?: number;
  jwk?: { x?: unknown; y?: unknown; crv?: unknown; kty?: unknown };
}

/** The subject the certificate asserts — what an assertion must then claim. */
export function subjectOf(certificate: string): string | null {
  const claims = decodeJwt<CertificateClaims>(certificate);
  return typeof claims?.sub === "string" && claims.sub ? claims.sub : null;
}

export function expiryOf(certificate: string): number | null {
  const claims = decodeJwt<CertificateClaims>(certificate);
  return typeof claims?.exp === "number" ? claims.exp * 1000 : null;
}

/**
 * Does this certificate still describe the key we would sign with? One naming a
 * different key is **worse than none** — it looks valid and fails at the far
 * end, which is what restoring a different backup produces.
 *
 * Compared on the coordinates rather than the whole object, since the two come
 * from different places and may disagree about key order or `key_ops`.
 */
export function describesKey(certificate: string, publicJwk: PublicJwk): boolean {
  const claims = decodeJwt<CertificateClaims>(certificate);
  const jwk = claims?.jwk;
  if (!jwk) return false;
  return (
    jwk.kty === publicJwk.kty && jwk.crv === publicJwk.crv && jwk.x === publicJwk.x && jwk.y === publicJwk.y
  );
}

/** Usable now, for this key, and not about to expire. */
export function isUsable(
  stored: StoredCertificate | null,
  publicJwk: PublicJwk,
  now = Date.now(),
): boolean {
  if (!stored) return false;
  if (stored.expiresAt - now <= RENEW_BUFFER_MS) return false;
  return describesKey(stored.certificate, publicJwk);
}

export class CertificateError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CertificateError";
  }
}

/**
 * Ask the identity service to vouch for this key.
 *
 * The same request the desktop client makes, deliberately — a certificate the
 * two clients disagree about the shape of is a server one of them cannot join.
 */
export async function requestCertificate({
  identityUrl,
  accessToken,
  publicJwk,
  fetchImpl = fetch,
}: {
  identityUrl: string;
  accessToken: string;
  publicJwk: PublicJwk;
  fetchImpl?: typeof fetch;
}): Promise<StoredCertificate> {
  const base = identityUrl.replace(/\/+$/, "");

  const res = await fetchImpl(`${base}/api/v1/certificate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ jwk: publicJwk }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CertificateError(
      `The identity service refused to sign this key (${res.status}). ${body}`.trim(),
      res.status,
    );
  }

  const data: unknown = await res.json();
  const certificate =
    data && typeof data === "object" && typeof (data as { certificate?: unknown }).certificate === "string"
      ? (data as { certificate: string }).certificate
      : null;

  if (!certificate) {
    throw new CertificateError("The identity service answered without a certificate.");
  }

  /* Checked here rather than trusted, because everything downstream assumes it.
   * A certificate for somebody else's key would be presented, accepted as
   * well-formed, and rejected by whichever server it reached. */
  if (!describesKey(certificate, publicJwk)) {
    throw new CertificateError("The identity service signed a different key than the one asked about.");
  }

  const expiresAt = expiryOf(certificate);
  if (expiresAt === null) {
    throw new CertificateError("The certificate has no expiry, so there is no way to know when to renew it.");
  }

  return { certificate, expiresAt };
}
