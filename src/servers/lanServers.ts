import type { LanServer } from "../../modules/lan-discovery";
import type { JoinedServer } from "./store";

/**
 * A server found on the network, in the terms the join sheet uses — what to put
 * in the address field, and whether you are already in it.
 */
export interface DiscoveredServer {
  /** The mDNS instance name. What the server calls itself. */
  name: string;
  /** `host:port`, which is exactly what the address field takes. */
  address: string;
  /**
   * The TXT record's `server_id`, kept because it is what the wire carries.
   * **It is not an identity** — see the note on merging below.
   */
  serverId: string | null;
  /** Already on your list, so the row says so instead of offering to add it. */
  joined: boolean;
}

/**
 * What to show under "On your network". **Merged on the address, and on nothing else.**
 * **Not on `server_id`**, which is `SERVER_INSTANCE_ID || "default"` and merged four
 * live servers into one row. mDNS renames a colliding instance name itself.
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

  /* Sorted here rather than trusted from the module, so the order does not depend on
   * which announcement arrived first. Servers you are not in come first. */
  return [...byAddress.values()].sort((a, b) => {
    if (a.joined !== b.joined) return a.joined ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
