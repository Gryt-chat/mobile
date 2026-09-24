import { describe, expect, it } from "vitest";

import { videoDemandFor } from "./videoDemand";

describe("videoDemandFor", () => {
  it("reports a drawn video's box in device pixels", () => {
    const drawn = new Map([["cam", { width: 180, height: 320.4 }]]);
    expect(videoDemandFor(["cam"], drawn, true, 2.625)).toEqual(
      new Map([["cam", { width: 473, height: 841 }]]),
    );
  });

  // Zero is what lets the sender pause, so a video nobody sees has to say it.
  it("reports 0x0 for a video drawn nowhere", () => {
    expect(videoDemandFor(["share"], new Map(), true, 3)).toEqual(
      new Map([["share", { width: 0, height: 0 }]]),
    );
  });

  it("reports 0x0 for everything while the call isn't on screen", () => {
    const drawn = new Map([["cam", { width: 400, height: 300 }]]);
    expect(videoDemandFor(["cam"], drawn, false, 3)).toEqual(new Map([["cam", { width: 0, height: 0 }]]));
  });

  it("treats a box with no size yet as not drawn", () => {
    const drawn = new Map([["cam", { width: 0, height: 300 }]]);
    expect(videoDemandFor(["cam"], drawn, true, 3).get("cam")).toEqual({ width: 0, height: 0 });
  });

  it("leaves out a drawn stream the engine doesn't have", () => {
    const drawn = new Map([["gone", { width: 400, height: 300 }]]);
    expect([...videoDemandFor(["cam"], drawn, true, 1).keys()]).toEqual(["cam"]);
  });
});
