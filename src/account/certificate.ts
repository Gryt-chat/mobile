import { decodeJwt } from "../connection/claims";
import { deriveLocalKeyPair, jwkThumbprint, signJwt, type PublicJwk } from "../identity/keys";

/* Fetching and holding the certificate that says a Gryt account holds this device's key.
 * Pure except for the `fetch`, which is passed in, so the decisions can be tested. */

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
 * different key is **worse than none**. Compared on the coordinates.
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

/* Must match the desktop's scope: linking and the 24 words copy the seed, so every device proves the same key. */
const ACCOUNT_CERT_SCOPE = "gryt:account-cert";

/** The account key the seed derives, which every device with your key shares. */
export function accountKeyJwk(seed: Uint8Array): PublicJwk {
  return deriveLocalKeyPair(seed, ACCOUNT_CERT_SCOPE).publicJwk;
}

/** Proof for the identity service that this device holds the account's seed, bound to one certificate key. */
export function seedProof(
  seed: Uint8Array,
  sub: string,
  certJwk: PublicJwk,
  now = Math.floor(Date.now() / 1000),
): string {
  const { privateKey, publicJwk } = deriveLocalKeyPair(seed, ACCOUNT_CERT_SCOPE);
  return signJwt({ sub, cnf: jwkThumbprint(certJwk), iat: now }, privateKey, { jwk: publicJwk });
}

/** A server's binding signed by the account key, so the server takes it without an older device's handover. */
export function accountKeyProof(seed: Uint8Array, binding: string, now = Math.floor(Date.now() / 1000)): string {
  const { privateKey, publicJwk } = deriveLocalKeyPair(seed, ACCOUNT_CERT_SCOPE);
  return signJwt({ binding, iat: now }, privateKey, { jwk: publicJwk });
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

/** The account only lets in devices you approved, and this one isn't on the list yet (GRYT-2016). */
export class ApprovalRequiredError extends CertificateError {
  readonly resetAt: number | null;
  /** Signed by the identity service, for your other devices to show a prompt. */
  readonly ticket: string | null;

  constructor(resetAt: number | null, ticket: string | null = null) {
    super("This sign-in needs approving from one of your devices.", 403);
    this.name = "ApprovalRequiredError";
    this.resetAt = resetAt;
    this.ticket = ticket;
  }
}

/**
 * Ask the identity service to vouch for this key — the same request the desktop makes,
 * deliberately, or one of them cannot join a server.
 */
export async function requestCertificate({
  identityUrl,
  accessToken,
  publicJwk,
  proof,
  device,
  deviceType,
  fetchImpl = fetch,
}: {
  identityUrl: string;
  accessToken: string;
  publicJwk: PublicJwk;
  /** Signed by the seed's account key, so the service knows this device holds your key (GRYT-2016). */
  proof?: string;
  /** Shown in the account's list of keys. */
  device?: string;
  /** "iPhone", "Pixel 8": what your other devices' prompt calls this one. */
  deviceType?: string;
  fetchImpl?: typeof fetch;
}): Promise<StoredCertificate> {
  const base = identityUrl.replace(/\/+$/, "");

  const res = await fetchImpl(`${base}/api/v1/certificate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ jwk: publicJwk, proof, device, deviceType }),
  });

  if (res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as { error?: unknown; resetAt?: unknown; ticket?: unknown } | null;
    if (body?.error === "approval_required") {
      throw new ApprovalRequiredError(
        typeof body.resetAt === "number" ? body.resetAt : null,
        typeof body.ticket === "string" ? body.ticket : null,
      );
    }
  }

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

  /* Checked here rather than trusted, because everything downstream assumes it. A
   * certificate for somebody else's key would be presented and then rejected. */
  if (!describesKey(certificate, publicJwk)) {
    throw new CertificateError("The identity service signed a different key than the one asked about.");
  }

  const expiresAt = expiryOf(certificate);
  if (expiresAt === null) {
    throw new CertificateError("The certificate has no expiry, so there is no way to know when to renew it.");
  }

  return { certificate, expiresAt };
}
