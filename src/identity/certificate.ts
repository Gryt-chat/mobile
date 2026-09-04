import { signJwt, subjectFor, type PublicJwk } from "./keys";

/**
 * The "local" identity tier: a member with no account behind them.
 *
 * The certificate is **self-signed by the very key it describes**, and proves
 * nothing — the server derives the subject from the key and ignores what the
 * certificate claims. What proves possession is the assertion over the nonce.
 *
 * Nothing here touches storage or a native module, which is what lets it be
 * tested in Node against the vectors.
 */

/** A day, matching the client. Long enough that a join and a reconnect share
 *  one, short enough to be worth re-deriving. */
const CERTIFICATE_TTL_SECONDS = 24 * 60 * 60;

/** A minute, and it is the server's replay window rather than a convenience. */
const ASSERTION_TTL_SECONDS = 60;

/**
 * Enough to answer a challenge: whose the certificate says you are, and the
 * key to prove it with.
 *
 * `LocalIdentity` satisfies this, which is why the local path needed no
 * changing — an account differs only in where the subject came from.
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
 * Answer a server's challenge.
 *
 * **`iss` carries the subject rather than `sub`**, which looks like a mistake
 * and is what the server reads. The desktop signs it this way and both clients
 * have to agree, so this follows rather than corrects it.
 *
 * **The subject is the one on the certificate being presented, not the one
 * derived from the key.** They differ for an account, and signing the
 * key-derived subject alongside an account certificate produces an assertion
 * that is cryptographically fine and names the wrong person.
 *
 * **`aud` is the `serverHost` from the challenge, and the caller must already
 * have checked it matches the host actually dialled.** Signing an assertion for
 * a host you did not dial is how a server in the middle gets one to replay.
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
 * Prove that the account joining is the same person who was here before
 * without one.
 *
 * Signed by the **local** key, which is the only thing that can say so: the
 * account certificate carries a Keycloak id and knows nothing about the
 * identity that came before it. Bound to the same nonce and audience as the
 * assertion, so it is good for exactly this join at exactly this server.
 *
 * `link_to` names the account being claimed. Without it a proof for one
 * account could be replayed to attach the same old membership to another. The
 * prior subject is not in here at all — the server derives it from `jwk`,
 * which is what stops a link naming somebody else's identity.
 *
 * **Sent with every account join**, unlike the desktop client, which sends one
 * only where a local key for the host already exists. It generates those
 * lazily; a key derived from one seed always exists, so the same test on this
 * side would always pass and therefore say nothing. Sending it regardless is
 * safe: with nothing to carry the server answers `no_prior_membership` and
 * moves on, and with both already members it leaves the guest membership where
 * it is rather than merging two sets of roles.
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
