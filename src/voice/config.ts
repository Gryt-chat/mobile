import type { VoiceConfig } from "@gryt/voice/native";

import type { VoiceState } from "../shell/ShellContext";

/**
 * What the engine needs to know, from what this app actually has. `inputMode` takes an
 * underscore — a hyphen compiles and the comparison is always false.
 */
export function voiceConfigFrom({
  voice,
  stunHosts = [],
}: {
  voice: VoiceState;
  /** From the server's own details. Empty until this app reads them. */
  stunHosts?: string[];
}): VoiceConfig {
  return {
    audio: {
      muted: voice.muted,
      deafened: voice.deafened,
      // Moderator state, which this app does not surface yet. False is not a
      // guess: the server enforces it regardless of what a client believes.
      serverMuted: false,
      serverDeafened: false,
      outputVolume: 1,
      inputMode: "voice_activity",
      volume: 1,
      loopback: false,
      // The platform's own suppression is on and is not switchable from
      // JavaScript, so asking for it here would be asking twice.
      noiseSuppression: false,
      // Zero disables gating. There is no graph to gate in.
      noiseGate: 0,
      noiseGateRelease: 0,
      autoGain: { enabled: false, targetDb: 0 },
      compressorEnabled: false,
      compressorAmount: 0,
    },
    /* Camera and screen are declared because the shape requires them, not because
     * anything captures yet. Whichever screen turns these on should own them. */
    camera: {
      quality: "720p",
      fps: 30,
      // The front camera reads as a mirror to the person holding it, which is
      // what every other video app does with a self view.
      mirrored: true,
    },
    screen: {
      quality: "720p",
      fps: 30,
      gamingMode: false,
    },
    connection: {
      stunHosts,
      eSportsMode: false,
      maxBitrate: null,
    },
  };
}
