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
  /** Best available human name, which may be the email or nothing at all. */
  label: string;
  email?: string;
}

export function profileFrom(idOrAccessToken: string): AccountProfile | null {
  const claims = decodeJwt<AccountClaims>(idOrAccessToken);
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return null;

  const label =
    (typeof claims.preferred_username === "string" && claims.preferred_username) ||
    (typeof claims.name === "string" && claims.name) ||
    (typeof claims.email === "string" && claims.email) ||
    claims.sub;

  return {
    sub: claims.sub,
    label,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
}
