import { normalizeHost } from "../servers/address";

/**
 * What a guest identity is filed under.
 *
 * One function, used for everything that is per-guest-identity: which key is
 * derived, which servers this device has been a guest on, and which of those an
 * account has been allowed to claim. They have to agree — a claim filed under a
 * different string from the key it is about would authorise the wrong thing.
 *
 * **On the desktop this is the server's lineage, not its address.** An address
 * changes when a port is taken or a router hands out a new lease, and filing an
 * identity under it meant the client recognised the server through its pin and
 * then arrived as a stranger: new subject, no roles, no history. GRYT-257 fixed
 * that there by filing under the origin key id from the pin.
 *
 * **This app is still on the address**, and switching is not a one-line change:
 * `deriveLocalKeyPair(seed, host)` takes the host, so moving to a lineage would
 * derive a different key on every server already joined and lose every guest
 * membership on the device. It needs a migration, and it is its own task —
 * GRYT-517.
 *
 * So this returns the host today. It exists as a named function anyway, because
 * the point of the desktop's version is that one string answers all three
 * questions, and having the name here is what makes the migration a change to
 * one function rather than a hunt.
 */
export function identityScopeFor(host: string): string {
  return normalizeHost(host);
}
