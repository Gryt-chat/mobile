import { describe, expect, it } from "vitest";

import { CALL_REFUSED, settleFailedJoin, staleRing } from "./refusedCall";

function recorder() {
  const calls: string[] = [];
  return {
    calls,
    settle: {
      cancelRing: (id: string) => calls.push(`cancel ${id}`),
      leave: () => calls.push("leave"),
      say: (message: string) => calls.push(`say ${message}`),
    },
  };
}

describe("a refused call", () => {
  it("cancels the ring, leaves and says so, once", () => {
    const { calls, settle } = recorder();
    expect(settleFailedJoin({ id: "dm_1", isCall: true, current: "dm_1" }, settle)).toBe(true);
    expect(calls).toEqual(["cancel dm_1", "leave", `say ${CALL_REFUSED}`]);
  });

  it("leaves a channel's failure to the sheet", () => {
    const { calls, settle } = recorder();
    expect(settleFailedJoin({ id: "general", isCall: false, current: "general" }, settle)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("ignores a failure from a call already left", () => {
    const { calls, settle } = recorder();
    expect(settleFailedJoin({ id: "dm_1", isCall: true, current: "dm_2" }, settle)).toBe(false);
    expect(settleFailedJoin({ id: "dm_1", isCall: true, current: null }, settle)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("cancels a ring the server confirms after the refusal", () => {
    expect(staleRing("dm_1", "dm_1")).toBe(true);
    expect(staleRing("dm_1", "dm_2")).toBe(false);
    expect(staleRing(null, "dm_1")).toBe(false);
  });
});
