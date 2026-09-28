import { describe, expect, it } from "vitest";

import { friendHeaderSteps } from "./friendHeaderSteps";

const NAME = "Alex";

describe("friendHeaderSteps", () => {
  it("sends a request straight away -- nothing to confirm", () => {
    const [step] = friendHeaderSteps("none", NAME);
    expect(step.action).toBe("request");
    expect(step.confirm).toBeUndefined();
  });

  it("asks before cancelling a sent request", () => {
    const [step] = friendHeaderSteps("outgoing", NAME);
    expect(step.action).toBe("cancel");
    expect(step.label).toContain(NAME);
    expect(step.confirm?.title).toBe(`Cancel your friend request to ${NAME}?`);
    expect(step.confirm?.confirmLabel).not.toBe(step.confirm?.cancelLabel);
  });

  it("offers accept and decline for an incoming request, neither one gated", () => {
    const steps = friendHeaderSteps("incoming", NAME);
    expect(steps.map((s) => s.action)).toEqual(["accept", "decline"]);
    expect(steps.every((s) => s.confirm === undefined)).toBe(true);
  });

  it("has nothing left to offer once you're already friends, or for an unconfirmed one", () => {
    expect(friendHeaderSteps("friend", NAME)).toEqual([]);
    expect(friendHeaderSteps("unconfirmed", NAME)).toEqual([]);
  });
});
