import { signJwt, subjectFor, type PublicJwk } from "./keys";

/**
 * The "local" identity tier: a member with no account behind them. The certificate is
 * **self-signed by the very key it describes** and proves nothing; the assertion over
 * the nonce is what proves possession. Nothing here touches storage.
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
 * Answer a server's challenge. **`iss` carries the subject rather than `sub`**, which
 * is what the server reads. **The subject is the one on the certificate, not the one
 * derived from the key.** **`aud` is the challenge's `serverHost`**, already checked.
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
 * Prove that the account joining is the same person who was here without one. Signed
 * by the **local** key, bound to the same nonce and audience. `link_to` names the
 * account, or a proof could be replayed. **Sent with every account join**, unlike the
 * desktop: a derived key always exists, so the same test would say nothing.
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
