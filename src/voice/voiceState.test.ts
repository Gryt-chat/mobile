import { describe, expect, it } from "vitest";

import { voiceStateReport } from "./voiceState";

describe("voiceStateReport", () => {
  it("carries mute and deafen, which is the whole point of sending it", () => {
    expect(voiceStateReport({ muted: true, deafened: true, camera: false, screen: false })).toEqual({
      isMuted: true,
      isDeafened: true,
      isAFK: false,
    });
  });

  /* The field names are the server's, and getting one wrong is a payload that
   * typechecks on both sides and records `undefined` as false — which reads
   * exactly like never having sent it. */
  it("spells the fields the way the server reads them", () => {
    expect(Object.keys(voiceStateReport({ muted: false, deafened: false, camera: false, screen: false })).sort()).toEqual([
      "isAFK",
      "isDeafened",
      "isMuted",
    ]);
  });

  it("does not claim to know whether the phone is away", () => {
    expect(voiceStateReport({ muted: false, deafened: false, camera: false, screen: false }).isAFK).toBe(false);
    expect(voiceStateReport({ muted: true, deafened: true, camera: false, screen: false }).isAFK).toBe(false);
  });
});
