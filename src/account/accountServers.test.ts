import { describe, expect, it } from "vitest";

import { parseHosts } from "./accountServers";

describe("parseHosts", () => {
  it("reads a list of hosts back", () => {
    expect(parseHosts(["a.example", "b.example"])).toEqual(["a.example", "b.example"]);
  });

  it("treats anything that is not a list as empty", () => {
    expect(parseHosts(null)).toEqual([]);
    expect(parseHosts(undefined)).toEqual([]);
    expect(parseHosts("a.example")).toEqual([]);
    expect(parseHosts({ host: "a.example" })).toEqual([]);
  });

  /* A row that is not a host cannot be left, and passing it to `leave` would
     filter the server list by a value nothing matches. Dropping it is the same
     "empty means keep the servers" trade the module makes elsewhere. */
  it("drops rows that are not usable hosts", () => {
    expect(parseHosts(["a.example", "", null, 42, { host: "b" }])).toEqual(["a.example"]);
  });
});
