import { signJwt, subjectFor, type PublicJwk } from "./keys";

/**
 * The "local" identity tier: a member with no account behind them.
 *
 * The certificate is **self-signed by the very key it describes**, which sounds
 * like it proves nothing and is exactly right. The server derives the subject
 * from the key itself and ignores whatever the certificate claims, so the
 * certificate is a container for the public key rather than an assertion of
 * anything. What proves possession is the assertion, signed over the server's
 * own nonce.
 *
 * Nothing in this file touches storage or a native module, which is what lets
 * it be tested in Node against the vectors — `localIdentity.ts` is the thin
 * part that reads the Keychain.
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
 * `iss` carries the subject rather than `sub`, which looks like a mistake and
 * is what the server reads — it falls back to `iss` when `sub` is absent, and
 * the desktop client signs it this way. Both clients have to agree, so this
 * follows rather than corrects it.
 *
 * **The subject is the one on the certificate being presented, not the one
 * derived from the key.** They are the same thing for a local identity and
 * different for an account, where the CA vouches for a Keycloak subject
 * holding this key. The server checks the assertion's subject against the
 * certificate's, so signing the key-derived subject alongside an account
 * certificate produces an assertion that is cryptographically fine and names
 * the wrong person. That is why this takes a subject rather than reading one.
 *
 * `aud` is the `serverHost` **from the challenge**, and the caller must have
 * already checked it matches the host actually dialled. Signing an assertion
 * for a host you did not dial is how a server in the middle gets one it can
 * replay somewhere else.
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
