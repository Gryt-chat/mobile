/**
 * Which auth server the phone talks to, as a decision rather than as storage. Separate
 * from `config.ts`, which reaches AsyncStorage and cannot be loaded in a test.
 */

export const DEFAULT_ISSUER = "https://auth.gryt.chat/realms/gryt";
export const DEFAULT_IDENTITY_URL = "https://id.gryt.chat";

export interface AccountConfig {
  issuer: string;
  clientId: string;
  /** Already whitelisted on `gryt-web`, and the app's scheme is already `gryt`. */
  redirectUri: string;
  /** The service that signs identity certificates. Only used by the account tier. */
  identityUrl: string;
  scopes: string[];
}

/**
 * The two overrides, and why they are two: different services on different hosts, with
 * nothing in an issuer URL to derive the other from. Moving one without the other is
 * GRYT-156 — a 401 saying "no applicable key found in the JWKS".
 */
export interface AuthOverride {
  issuer: string | null;
  identityUrl: string | null;
}

export const NO_OVERRIDE: AuthOverride = { issuer: null, identityUrl: null };

/**
 * Trimmed, and without the trailing slash. **The issuer is string-compared against
 * `iss` in every token**, so `…/realms/gryt/` and `…/realms/gryt` differ.
 */
export function normalizeAuthUrl(input: string | null | undefined): string {
  return String(input ?? "").trim().replace(/\/+$/, "");
}

/** Empty is not an override. A field somebody cleared means "back to Gryt's". */
export function toOverride(next: Partial<AuthOverride>): AuthOverride {
  const issuer = normalizeAuthUrl(next.issuer);
  const identityUrl = normalizeAuthUrl(next.identityUrl);
  return {
    issuer: issuer || null,
    identityUrl: identityUrl || null,
  };
}

/**
 * Whatever was in storage, read defensively. Anything that is not a string is not an
 * override: a half-written blob should leave the app pointed at production.
 */
export function parseOverride(raw: unknown): AuthOverride {
  if (!raw || typeof raw !== "object") return NO_OVERRIDE;
  const value = raw as Partial<Record<keyof AuthOverride, unknown>>;
  return toOverride({
    issuer: typeof value.issuer === "string" ? value.issuer : null,
    identityUrl: typeof value.identityUrl === "string" ? value.identityUrl : null,
  });
}

export function isDefault(override: AuthOverride): boolean {
  return !override.issuer && !override.identityUrl;
}

export function resolveAccountConfig(override: AuthOverride): AccountConfig {
  return {
    issuer: override.issuer ?? DEFAULT_ISSUER,
    clientId: "gryt-web",
    redirectUri: "gryt://auth/callback",
    identityUrl: override.identityUrl ?? DEFAULT_IDENTITY_URL,
    scopes: ["openid", "profile", "email", "offline_access"],
  };
}

/**
 * Keycloak's endpoints, spelled out rather than discovered. They are the same four
 * paths under every realm, so `.well-known` would be a round trip for nothing.
 */
export function discoveryFor(issuer: string) {
  return {
    authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
    tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
    revocationEndpoint: `${issuer}/protocol/openid-connect/revoke`,
    endSessionEndpoint: `${issuer}/protocol/openid-connect/logout`,
  };
}
