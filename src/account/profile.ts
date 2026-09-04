import { decodeJwt } from "../connection/claims";

/**
 * Who the account is, read from the token Keycloak issued.
 *
 * Read, not verified. The same reasoning as the server tokens: this decides
 * what name to draw, and the identity service checks the signature before it
 * will sign anything on the strength of it.
 */
interface AccountClaims {
  sub?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  exp?: number;
}

export interface AccountProfile {
  /** The Keycloak subject. What a Gryt identity is ultimately keyed on. */
  sub: string;
  /**
   * Best available way to say *which account this is*, which may be the email.
   *
   * For the Account row at the foot of the You page, where an email is the
   * right answer — it is how you signed in and it is what tells two accounts
   * apart. Not for anywhere your *name* goes: see `displayName`.
   */
  label: string;
  /**
   * A name the account actually chose, or undefined. **Split off from `label`,
   * whose fallback chain runs through the email** — losing the session put your
   * own email where your name had been (GRYT-500). An email Keycloak copied
   * into `preferred_username` is not a chosen name either.
   */
  displayName?: string;
  email?: string;
}

export function profileFrom(idOrAccessToken: string): AccountProfile | null {
  const claims = decodeJwt<AccountClaims>(idOrAccessToken);
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return null;

  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;

  const email = text(claims.email);
  const chosen = [text(claims.preferred_username), text(claims.name)].find(
    (value) => value !== undefined && value !== email,
  );

  return {
    sub: claims.sub,
    label: text(claims.preferred_username) ?? text(claims.name) ?? email ?? claims.sub,
    displayName: chosen,
    email,
  };
}
