import { base64UrlDecode } from "../identity/encoding";

/**
 * What the server puts inside an access token.
 *
 * Read, never trusted. The signature is not checked here and could not be —
 * the secret is the server's. Everything below is used for two things only:
 * deciding when to ask for a new token, and drawing your own name on a message
 * you have just sent. Both are cosmetic if wrong, and the server re-derives
 * the real values from the token it verifies.
 *
 * Every field is optional because an older or differently configured server is
 * free to leave one out, and a missing nickname must not take the screen down.
 */
export interface TokenClaims {
  grytUserId?: string;
  serverUserId?: string;
  nickname?: string;
  serverHost?: string;
  tokenVersion?: number;
  exp?: number;
}

/** The claims, or null for anything that is not a readable JWT. */
export function decodeToken(token: string): TokenClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!claims || typeof claims !== "object") return null;
    return claims as TokenClaims;
  } catch {
    return null;
  }
}

/**
 * Who this device is on the server that issued the token.
 *
 * `serverUserId` is the part that matters. A message drawn before the server
 * has answered has to carry the same sender id the real one will, or it lands
 * in a block of its own and then visibly jumps into place a moment later.
 */
export interface SessionIdentity {
  serverUserId: string;
  nickname: string;
}

export function identityFrom(token: string): SessionIdentity | null {
  const claims = decodeToken(token);
  if (!claims || typeof claims.serverUserId !== "string" || !claims.serverUserId) return null;
  return {
    serverUserId: claims.serverUserId,
    nickname: typeof claims.nickname === "string" ? claims.nickname : "",
  };
}
