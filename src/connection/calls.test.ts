import { describe, expect, it } from "vitest";

import {
  afterWithdrawal,
  endedMessage,
  hasExpired,
  isRing,
  type IncomingCall,
} from "./calls";

function ring(conversationId: string, expiresAt = 10_000): IncomingCall {
  return {
    conversation_id: conversationId,
    from: { server_user_id: "user_ada", nickname: "Ada" },
    expires_at: expiresAt,
  };
}

describe("isRing", () => {
  it("takes a ring the server sent", () => {
    expect(isRing(ring("dm_a"))).toBe(true);
  });

  it("refuses anything that is not one", () => {
    expect(isRing(null)).toBe(false);
    expect(isRing({})).toBe(false);
    expect(isRing({ conversation_id: "" , from: { server_user_id: "x" } })).toBe(false);
    expect(isRing({ conversation_id: "dm_a" })).toBe(false);
    expect(isRing({ conversation_id: "dm_a", from: null })).toBe(false);
  });
});

describe("afterWithdrawal", () => {
  it("clears the ring it names", () => {
    expect(afterWithdrawal(ring("dm_a"), { conversation_id: "dm_a", reason: "declined" })).toBe(null);
  });

  it("leaves a different conversation's ring alone", () => {
    // Two rings can be going at once — one you started and one somebody
    // started at you. Clearing on any withdrawal takes down the wrong one.
    const mine = ring("dm_a");
    expect(afterWithdrawal(mine, { conversation_id: "dm_b", reason: "declined" })).toBe(mine);
  });

  it("leaves it alone when the payload names nothing", () => {
    const mine = ring("dm_a");
    expect(afterWithdrawal(mine, {})).toBe(mine);
  });

  it("is null when there was nothing ringing", () => {
    expect(afterWithdrawal(null, { conversation_id: "dm_a" })).toBe(null);
  });
});

describe("hasExpired", () => {
  it("is false while the server's clock is still running", () => {
    expect(hasExpired(ring("dm_a", 10_000), 9_999)).toBe(false);
  });

  it("is true once it is not", () => {
    expect(hasExpired(ring("dm_a", 10_000), 10_000)).toBe(true);
  });

  it("is false when nothing is ringing", () => {
    expect(hasExpired(null, 10_000)).toBe(false);
  });
});

describe("endedMessage", () => {
  it("says a call was refused", () => {
    expect(endedMessage({ reason: "declined" })).toBe("Call declined");
  });

  it("says nobody picked up", () => {
    expect(endedMessage({ reason: "timeout" })).toBe("No answer");
  });

  it("says nothing about being answered — being in a call says that", () => {
    expect(endedMessage({ reason: "answered" })).toBe(null);
  });

  it("says nothing back to whoever cancelled it", () => {
    expect(endedMessage({ reason: "cancelled" })).toBe(null);
  });
});
