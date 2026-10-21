import { describe, expect, it } from "vitest";

import { measuredByUser } from "./transportLatency";

describe("the call's measured latency", () => {
  it("pairs each person's round trip with what of theirs is buffered here", () => {
    const by = measuredByUser({ rttByUser: new Map([["u1", 21.4]]), bufferedByUser: new Map([["u1", 12], ["u2", 30]]) });
    expect(by.get("u1")).toEqual({ rttMs: 21.4, bufferedMs: 12 });
  });

  it("keeps someone with only one of the two, rather than hiding them", () => {
    const by = measuredByUser({ rttByUser: new Map([["u3", 40]]), bufferedByUser: new Map([["u2", 30]]) });
    expect(by.get("u2")).toEqual({ rttMs: null, bufferedMs: 30 });
    expect(by.get("u3")).toEqual({ rttMs: 40, bufferedMs: null });
  });
});
