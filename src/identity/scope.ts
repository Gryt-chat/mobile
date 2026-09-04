import { normalizeHost } from "../servers/address";

/**
 * What a guest identity is filed under. **One function for all three
 * per-identity questions** — which key is derived, which servers this device
 * has been a guest on, and which an account may claim. A claim filed under a
 * different string from the key it is about authorises the wrong thing.
 *
 * The desktop files under the server's lineage (GRYT-257). **This app is still
 * on the address**, and switching would derive a different key on every server
 * already joined and lose every guest membership on the device. It needs a
 * migration, and it is GRYT-517.
 *
 * It exists as a named function anyway, so that migration is a change to one
 * function rather than a hunt.
 */
export function identityScopeFor(host: string): string {
  return normalizeHost(host);
}
