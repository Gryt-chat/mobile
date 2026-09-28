import { describe, expect, it } from "vitest";

import { voiceConfigFrom } from "./config";
import { micMuted, parsePushToTalk } from "./talkGate";

const voice = { muted: false, deafened: false, camera: false, screen: false };

describe("push to talk", () => {
  it("opens the microphone only while the button is held", () => {
    expect(micMuted(false, { enabled: true, held: false })).toBe(true);
    expect(micMuted(false, { enabled: true, held: true })).toBe(false);
  });

  it("never opens over your own mute, as the desktop's gate doesn't", () => {
    expect(micMuted(true, { enabled: true, held: true })).toBe(true);
  });

  it("changes nothing while it's off", () => {
    expect(micMuted(false, { enabled: false, held: false })).toBe(false);
    expect(micMuted(true, { enabled: false, held: false })).toBe(true);
  });

  it("reaches the engine as its mute and its input mode", () => {
    const released = voiceConfigFrom({ voice, pushToTalk: { enabled: true, held: false } });
    expect(released.audio.muted).toBe(true);
    expect(released.audio.inputMode).toBe("push_to_talk");
    const held = voiceConfigFrom({ voice, pushToTalk: { enabled: true, held: true } });
    expect(held.audio.muted).toBe(false);
    expect(voiceConfigFrom({ voice }).audio.inputMode).toBe("voice_activity");
  });

  it("reads the stored setting defensively", () => {
    expect(parsePushToTalk({ enabled: true })).toBe(true);
    expect(parsePushToTalk({ enabled: "yes" })).toBe(false);
    expect(parsePushToTalk(null)).toBe(false);
  });
});
