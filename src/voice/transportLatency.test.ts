import { describe, expect, it } from "vitest";

import { estimateByUser, roundTripMs } from "./transportLatency";

describe("the call's latency estimate", () => {
  it("adds capture, frame, one round trip, the buffer and output", () => {
    const t = { frameMs: 2.5, inputMs: 5, outputMs: 7, bufferedByUser: new Map([["u1", 10], ["u2", 30]]) };
    const by = estimateByUser(t, 20);
    expect(by.get("u1")).toBe(44.5);
    expect(by.get("u2")).toBe(64.5);
  });

  it("counts what it doesn't know as nothing rather than hiding the person", () => {
    const t = { frameMs: 2.5, inputMs: null, outputMs: null, bufferedByUser: new Map([["u1", 10]]) };
    expect(estimateByUser(t, null).get("u1")).toBe(12.5);
  });

  it("takes the round trip from the nominated, working pair only", () => {
    const stats = [
      { type: "candidate-pair", state: "failed", nominated: true, currentRoundTripTime: 0.5 },
      { type: "candidate-pair", state: "succeeded", nominated: false, currentRoundTripTime: 0.4 },
      { type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 0.021 },
    ];
    expect(roundTripMs(stats)).toBeCloseTo(21);
    expect(roundTripMs([])).toBeNull();
  });
});
