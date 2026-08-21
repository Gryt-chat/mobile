import { describe, expect, it } from "vitest";

import type { LanServer } from "../../modules/lan-discovery";
import { describeLanServers } from "./lanServers";
import type { JoinedServer } from "./store";

/* The merging is what has a real cost when it is wrong, and the cost is not
 * symmetric: a duplicate row is untidy, a merged row hides a server you cannot
 * then join. The `server_id` case is here because it happened — four live
 * servers on one network all publishing `server_id=default` came out as one
 * row, and the list looked like discovery working. */

function lan(over: Partial<LanServer> = {}): LanServer {
  return {
    name: "Gryt Server",
    host: "192.168.1.10",
    port: 5001,
    serverId: null,
    ...over,
  };
}

function joined(over: Partial<JoinedServer> = {}): JoinedServer {
  return { host: "192.168.1.10:5001", name: "Gryt Server", ...over };
}

describe("describeLanServers", () => {
  it("gives the address field something it can take", () => {
    const [server] = describeLanServers([lan()], []);

    expect(server.address).toBe("192.168.1.10:5001");
  });

  it("collapses a server announcing itself twice on one address", () => {
    const result = describeLanServers([lan(), lan()], []);

    expect(result).toHaveLength(1);
  });

  it("keeps two servers apart when they share the default server_id", () => {
    const result = describeLanServers(
      [
        lan({ name: "One", host: "192.168.1.10", serverId: "default" }),
        lan({ name: "Two", host: "192.168.1.11", serverId: "default" }),
      ],
      [],
    );

    expect(result.map((s) => s.name)).toEqual(["One", "Two"]);
  });

  it("keeps two servers that both published no id apart", () => {
    const result = describeLanServers(
      [
        lan({ name: "One", host: "192.168.1.10" }),
        lan({ name: "Two", host: "192.168.1.11" }),
      ],
      [],
    );

    expect(result.map((s) => s.name)).toEqual(["One", "Two"]);
  });

  it("knows a server you are already in, by address", () => {
    const [server] = describeLanServers([lan()], [joined()]);

    expect(server.joined).toBe(true);
  });

  it("does not call a server joined because an unrelated id matches", () => {
    /* `/info`'s serverId and the TXT record's server_id are different fields
     * that share a name. A joined server carrying one is not evidence about a
     * discovered server carrying the other. */
    const [server] = describeLanServers(
      [lan({ host: "10.0.0.4", serverId: "default" })],
      [joined({ host: "192.168.1.10:5001", serverId: "default" })],
    );

    expect(server.joined).toBe(false);
  });

  it("puts the ones you can join first", () => {
    const result = describeLanServers(
      [
        lan({ name: "Already", host: "192.168.1.10" }),
        lan({ name: "New", host: "192.168.1.11" }),
      ],
      [joined({ host: "192.168.1.10:5001" })],
    );

    expect(result.map((s) => s.name)).toEqual(["New", "Already"]);
  });
});
