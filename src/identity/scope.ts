import { normalizeHost } from "../servers/address";

/**
 * What a guest identity is filed under — one function for all three questions, since a
 * claim under a different string authorises the wrong thing. Still the address (GRYT-517).
 */
export function identityScopeFor(host: string): string {
  return normalizeHost(host);
}
