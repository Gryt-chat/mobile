import type { LanServer } from "../../modules/lan-discovery";
import type { JoinedServer } from "./store";

/**
 * A server found on the network, in the terms the join sheet uses.
 *
 * The module reports what mDNS said: a name, an address, a port and whatever
 * was in the TXT record. This turns that into the two things the list actually
 * needs — something to put in the address field, and whether you are already
 * in it.
 */
export interface DiscoveredServer {
  /** The mDNS instance name. What the server calls itself. */
  name: string;
  /** `host:port`, which is exactly what the address field takes. */
  address: string;
  /**
   * The TXT record's `server_id`, kept because it is what the wire carries and
   * the desktop client reports it too.
   *
   * **It is not an identity.** See the note on merging below.
   */
  serverId: string | null;
  /** Already on your list, so the row says so instead of offering to add it. */
  joined: boolean;
}

/**
 * What to show under "On your network".
 *
 * Merged on the address, and on nothing else.
 *
 * **Not on `server_id`, which is the trap here.** The name suggests an
 * identity and the field is not one: the server sends
 * `SERVER_INSTANCE_ID || "default"`, which exists to tell two servers on one
 * host apart — it is what keeps them from overwriting each other's avahi
 * service file, GRYT-227 — and almost nobody sets it. Every server on a
 * network that has not been told otherwise publishes `server_id=default`.
 * Deduplicating on it merged four live servers into one row on the first
 * network this was run against, which reads as discovery finding nothing
 * rather than as discovery hiding things.
 *
 * The address is enough. A service instance name is unique on a network by
 * mDNS's own rules — a second server called "Gryt" is renamed by the responder
 * rather than allowed to collide — and the module keys what it has found by
 * that name, so one server answering on two interfaces has already collapsed
 * before this sees it.
 *
 * `joined` is matched on the address for the same reason, and because the
 * address is what the store keys on. A `serverId` from `/info` is a genuine
 * server identity but it is a *different* field from this one, and comparing
 * the two would be comparing two namespaces that happen to share a name.
 *
 * The desktop client still merges on `server_id`, in
 * `electron/lanDiscovery.ts`, and hides servers on this network today.
 * GRYT-485.
 */
export function describeLanServers(
  found: LanServer[],
  joined: JoinedServer[],
): DiscoveredServer[] {
  const byAddress = new Map<string, DiscoveredServer>();
  const joinedAddresses = new Set(joined.map((s) => s.host));

  for (const server of found) {
    const address = `${server.host}:${server.port}`;
    if (byAddress.has(address)) continue;

    byAddress.set(address, {
      name: server.name,
      address,
      serverId: server.serverId,
      joined: joinedAddresses.has(address),
    });
  }

  /* Sorted here rather than trusted from the module, so the order does not
   * depend on which of two announcements arrived first. Servers you are not in
   * come first: the list exists to join something, and the ones you are
   * already in are context. */
  return [...byAddress.values()].sort((a, b) => {
    if (a.joined !== b.joined) return a.joined ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
