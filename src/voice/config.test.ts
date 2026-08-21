import { describe, expect, it } from "vitest";

import { voiceConfigFrom } from "./config";

const voice = { muted: false, deafened: false, camera: false, screen: false };

describe("voiceConfigFrom", () => {
  it("carries mute and deafen through, since those are the two the shell owns", () => {
    const config = voiceConfigFrom({ voice: { ...voice, muted: true, deafened: true } });
    expect(config.audio.muted).toBe(true);
    expect(config.audio.deafened).toBe(true);
  });

  /* Moderator state is the server's to enforce and this app does not surface
   * it. False here is not a claim that nobody is muted. */
  it("does not pretend to know the moderator state", () => {
    const config = voiceConfigFrom({ voice });
    expect(config.audio.serverMuted).toBe(false);
    expect(config.audio.serverDeafened).toBe(false);
  });

  /* The spelling the package warns about. A hyphen compiles on both sides and
   * silently never engages push-to-talk (GRYT-340), so it is worth a test
   * rather than only a comment. */
  it("spells inputMode with an underscore", () => {
    expect(voiceConfigFrom({ voice }).audio.inputMode).toBe("voice_activity");
    expect(voiceConfigFrom({ voice }).audio.inputMode).not.toContain("-");
  });

  /* There is no audio graph on the phone — the platform's voice-processing
   * unit does this before anything reaches JavaScript. Asking for it here
   * would be asking twice. */
  it("leaves the processing the platform already does switched off", () => {
    const { audio } = voiceConfigFrom({ voice });
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.noiseGate).toBe(0);
    expect(audio.autoGain.enabled).toBe(false);
    expect(audio.compressorEnabled).toBe(false);
  });

  it("passes the STUN hosts it is given, and defaults to none", () => {
    expect(voiceConfigFrom({ voice }).connection.stunHosts).toEqual([]);
    expect(
      voiceConfigFrom({ voice, stunHosts: ["stun:one.example"] }).connection.stunHosts,
    ).toEqual(["stun:one.example"]);
  });
});

/* The engine refuses to connect without at least one STUN host — it throws
 * "SFU configuration not available" — so an empty list is not a detail. */
describe("stunHosts, which the engine will not connect without", () => {
  it("passes the server's own through", () => {
    const config = voiceConfigFrom({ voice, stunHosts: ["stun:a.example", "stun:b.example"] });
    expect(config.connection.stunHosts).toEqual(["stun:a.example", "stun:b.example"]);
  });
});
