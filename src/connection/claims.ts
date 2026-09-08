import { base64UrlDecode } from "../identity/encoding";

/**
 * What the server puts inside an access token. **Read, never trusted** — it decides
 * when to refresh and draws your own name, both cosmetic if wrong. Every field optional.
 */
export interface TokenClaims {
  grytUserId?: string;
  serverUserId?: string;
  nickname?: string;
  serverHost?: string;
  tokenVersion?: number;
  exp?: number;
}

/**
 * A JWT's payload, or null. Generic, because a server access token and a Keycloak one
 * share nothing but the encoding. **Neither is verified.**
 */
export function decodeJwt<T>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!claims || typeof claims !== "object") return null;
    return claims as T;
  } catch {
    return null;
  }
}

/** The claims a Gryt server puts in its own tokens. */
export function decodeToken(token: string): TokenClaims | null {
  return decodeJwt<TokenClaims>(token);
}

/**
 * Who this device is on the server that issued the token. A message drawn before the
 * server answers has to carry the same sender id, or it visibly jumps into place.
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
