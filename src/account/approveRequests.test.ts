import { afterEach, describe, expect, it, vi } from "vitest";

import { addApproveRequest, removeApproveRequest, useApproveRequests } from "./approveRequests";

vi.mock("react", () => ({ useSyncExternalStore: <T,>(_subscribe: () => void, get: () => T) => get() }));

const ask = (askId: string, ms: number, host = "h") => ({ host, askId, deviceType: "Mac", askedAt: Date.now(), expiresAt: Date.now() + ms, deny: () => {} });

afterEach(() => {
  removeApproveRequest("h");
  removeApproveRequest("other");
  vi.useRealTimers();
});

describe("approve requests", () => {
  it("keeps one per ask, and drops an answered one", () => {
    addApproveRequest(ask("a", 60_000));
    addApproveRequest(ask("a", 60_000));
    addApproveRequest(ask("b", 60_000, "other"));
    expect(useApproveRequests().map((r) => r.askId)).toEqual(["a", "b"]);
    removeApproveRequest("h", "a");
    expect(useApproveRequests().map((r) => r.askId)).toEqual(["b"]);
  });

  it("drops a request when its ticket runs out, and never takes an expired one", () => {
    vi.useFakeTimers();
    addApproveRequest(ask("late", -1));
    addApproveRequest(ask("soon", 1000));
    expect(useApproveRequests().map((r) => r.askId)).toEqual(["soon"]);
    vi.advanceTimersByTime(1100);
    expect(useApproveRequests()).toEqual([]);
  });
});
