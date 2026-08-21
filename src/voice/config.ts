import type { VoiceConfig } from "@gryt/voice/native";

import type { VoiceState } from "../shell/ShellContext";

/**
 * What the engine needs to know, from what this app actually has.
 *
 * Most of `VoiceConfig` describes an audio graph the phone does not run: the
 * platform's own voice-processing unit does noise suppression, gating and gain
 * before anything reaches JavaScript, and there is no `AudioContext` here to
 * build the rest in. So those fields are off rather than guessed at, and this
 * function is the one place that says so.
 *
 * `inputMode` is spelled with an underscore. The package's own note explains
 * why that is worth stating: an embedder that types it as a plain string can
 * hand over `"push-to-talk"`, compile on both sides, and only find out at
 * runtime, where the comparison is always false and push-to-talk silently never
 * engages. Typed here as the union so a hyphen cannot be written.
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
    /* Camera and screen are declared because the shape requires them, not
     * because anything captures yet. 720p is the phone-shaped default rather
     * than a decision — whichever screen turns these on should own them. */
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
