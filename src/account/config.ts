/**
 * Where a Gryt account lives.
 *
 * The same realm and client the desktop client uses. `gryt-web` is a public
 * client with PKCE, and its redirect list already contains `gryt://auth/callback`
 * — checked against the deployed realm rather than the JSON in `packages/auth`,
 * because those two are allowed to drift and only one of them can refuse a
 * login. A made-up redirect against the same client answers "Invalid parameter:
 * redirect_uri"; this one answers with the Gryt login page.
 *
 * Hard-coded rather than configurable, for now. The desktop client lets a
 * custom identity service be set and derives the realm from it; nothing on the
 * phone can set one yet, and inventing the plumbing before there is a way to
 * reach it would be building the second half first.
 */
export const ACCOUNT = {
  issuer: "https://auth.gryt.chat/realms/gryt",
  clientId: "gryt-web",
  /** Already whitelisted, and the app's scheme is already `gryt`. */
  redirectUri: "gryt://auth/callback",
  /** The service that signs identity certificates. Not used until the account tier joins. */
  identityUrl: "https://id.gryt.chat",
  scopes: ["openid", "profile", "email", "offline_access"],
} as const;

export const DISCOVERY = {
  authorizationEndpoint: `${ACCOUNT.issuer}/protocol/openid-connect/auth`,
  tokenEndpoint: `${ACCOUNT.issuer}/protocol/openid-connect/token`,
  revocationEndpoint: `${ACCOUNT.issuer}/protocol/openid-connect/revoke`,
  endSessionEndpoint: `${ACCOUNT.issuer}/protocol/openid-connect/logout`,
} as const;
