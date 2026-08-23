import { describe, expect, it } from "vitest";

import { isSpeakDenial, voiceStateReport } from "./voiceState";

describe("voiceStateReport", () => {
  it("carries mute and deafen, which is the whole point of sending it", () => {
    expect(voiceStateReport({ muted: true, deafened: true })).toEqual({
      isMuted: true,
      isDeafened: true,
      isAFK: false,
    });
  });

  /* The field names are the server's, and getting one wrong is a payload that
   * typechecks on both sides and records `undefined` as false — which reads
   * exactly like never having sent it. */
  it("spells the fields the way the server reads them", () => {
    expect(Object.keys(voiceStateReport({ muted: false, deafened: false })).sort()).toEqual([
      "isAFK",
      "isDeafened",
      "isMuted",
    ]);
  });

  it("does not claim to know whether the phone is away", () => {
    expect(voiceStateReport({ muted: false, deafened: false }).isAFK).toBe(false);
    expect(voiceStateReport({ muted: true, deafened: true }).isAFK).toBe(false);
  });
});

describe("isSpeakDenial", () => {
  it("is the refusal to record you unmuted", () => {
    expect(
      isSpeakDenial({
        error: "forbidden",
        message: "You can listen here, but not speak.",
        permission: "speak",
      }),
    ).toBe(true);
  });

  /* The same event name carries the refusals for asking for a room, and those
   * are the room coordinator's to handle. Muting the phone because a room was
   * full would be a mute nobody asked for and nothing would undo. */
  it("is not every error on that event", () => {
    expect(isSpeakDenial({ error: "forbidden", permission: "join_voice" })).toBe(false);
    expect(isSpeakDenial({ error: "full", message: "That channel is full." })).toBe(false);
  });

  it("survives a server that sends something else entirely", () => {
    expect(isSpeakDenial(null)).toBe(false);
    expect(isSpeakDenial(undefined)).toBe(false);
    expect(isSpeakDenial("forbidden")).toBe(false);
    expect(isSpeakDenial({})).toBe(false);
  });
});
