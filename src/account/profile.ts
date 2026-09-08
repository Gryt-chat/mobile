import { decodeJwt } from "../connection/claims";

/**
 * Who the account is, read from the token Keycloak issued. Read, not verified: this
 * decides what name to draw, and the identity service checks the signature.
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
   * Best available way to say *which account this is*, which may be the email — for the
   * Account row, where that is the right answer. Not for anywhere your *name* goes.
   */
  label: string;
  /**
   * A name the account actually chose, or undefined. **Split off from `label`, whose
   * fallback runs through the email**, which turned up where a name had been.
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
