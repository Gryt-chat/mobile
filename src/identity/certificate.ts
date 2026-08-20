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
 * `aud` is the `serverHost` **from the challenge**, and the caller must have
 * already checked it matches the host actually dialled. Signing an assertion
 * for a host you did not dial is how a server in the middle gets one it can
 * replay somewhere else.
 */
export function signAssertion(
  identity: LocalIdentity,
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
