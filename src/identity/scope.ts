import { normalizeHost } from "../servers/address";

/**
 * What a guest identity is filed under. **One function for all three per-identity
 * questions**, since a claim filed under a different string authorises the wrong thing.
 * The desktop uses the lineage; **this app is still on the address** and needs a
 * migration, which is GRYT-517. Named anyway, so that is a change to one function.
 */
export function identityScopeFor(host: string): string {
  return normalizeHost(host);
}
