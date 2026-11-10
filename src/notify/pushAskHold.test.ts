import { describe, expect, it } from "vitest";

import { holdPushAsk, pushAskHeld } from "./pushAskHold";

describe("holdPushAsk", () => {
  it("stays held until every hold is released, and a second release does nothing", () => {
    const a = holdPushAsk();
    const b = holdPushAsk();
    a();
    a();
    expect(pushAskHeld()).toBe(true);
    b();
    expect(pushAskHeld()).toBe(false);
  });
});
