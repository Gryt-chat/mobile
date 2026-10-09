import { describe, expect, it } from "vitest";

import { levelsFrom } from "./speaking";

describe("levelsFrom", () => {
  it("reads the mic and each remote audio track", () => {
    const report = new Map<string, unknown>([
      ["a", { type: "media-source", kind: "audio", audioLevel: 0.2 }],
      ["b", { type: "inbound-rtp", kind: "audio", trackIdentifier: "t1", audioLevel: 0.4 }],
      ["c", { type: "inbound-rtp", kind: "audio", trackIdentifier: "t2", audioLevel: 0.001 }],
      ["d", { type: "inbound-rtp", kind: "video", trackIdentifier: "t3", audioLevel: 0.9 }],
    ]);
    const { mic, tracks } = levelsFrom(report);
    expect(mic).toBe(0.2);
    expect([...tracks]).toEqual([["t1", 0.4], ["t2", 0.001]]);
  });

  it("says nothing about the mic when there's no media-source", () => {
    expect(levelsFrom(new Map()).mic).toBeNull();
  });
});
