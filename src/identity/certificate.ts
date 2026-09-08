import { signJwt, subjectFor, type PublicJwk } from "./keys";

/**
 * The "local" identity tier: a member with no account behind them. The certificate is
 * **self-signed by the key it describes**; the assertion over the nonce proves it.
 */

/** A day, matching the client. Long enough that a join and a reconnect share
 *  one, short enough to be worth re-deriving. */
const CERTIFICATE_TTL_SECONDS = 24 * 60 * 60;

/** A minute, and it is the server's replay window rather than a convenience. */
const ASSERTION_TTL_SECONDS = 60;

/**
 * Enough to answer a challenge: whose the certificate says you are, and the key to
 * prove it with. `LocalIdentity` satisfies this, so the local path needed no changing.
 */
export interface SigningIdentity {
  sub: string;
  privateKey: Uint8Array;
}

export interface LocalIdentity {
  sub: string;
  certificate: string;
  publicJwk: PublicJwk;
  privateKey: Uint8Array;
}

/** Build the self-signed certificate for a derived keypair. */
export function buildLocalIdentity(
  publicJwk: PublicJwk,
  privateKey: Uint8Array,
  now = Math.floor(Date.now() / 1000),
): LocalIdentity {
  const sub = subjectFor(publicJwk);

  const certificate = signJwt(
    {
      iss: "gryt:self",
      sub,
      jwk: publicJwk,
      iat: now,
      exp: now + CERTIFICATE_TTL_SECONDS,
    },
    privateKey,
  );

  return { sub, certificate, publicJwk, privateKey };
}

/**
 * Answer a server's challenge. **`iss` carries the subject rather than `sub`.** **The
 * subject is the certificate's, not the key-derived one.** `aud` is already checked.
 */
export function signAssertion(
  identity: SigningIdentity,
  serverHost: string,
  nonce: string,
  now = Math.floor(Date.now() / 1000),
): string {
  return signJwt(
    {
      iss: identity.sub,
      aud: serverHost,
      nonce,
      iat: now,
      exp: now + ASSERTION_TTL_SECONDS,
    },
    identity.privateKey,
  );
}

/** The `iss` the server dispatches a link proof on. Both clients must agree. */
const LINK_ISSUER = "gryt:link";

/**
 * Prove the account joining is the person who was here without one, signed by the local
 * key and bound to the same nonce. Sent with every account join; a derived key exists.
 */
export function signIdentityLink(
  identity: LocalIdentity,
  serverHost: string,
  nonce: string,
  accountSub: string,
  now = Math.floor(Date.now() / 1000),
): string {
  return signJwt(
    {
      iss: LINK_ISSUER,
      aud: serverHost,
      jwk: identity.publicJwk,
      nonce,
      link_to: accountSub,
      iat: now,
      exp: now + ASSERTION_TTL_SECONDS,
    },
    identity.privateKey,
  );
}
