import type { VoiceState } from "../shell/ShellContext";

/**
 * What the room is told about you. The phone kept mute and deafen to itself, so muting
 * was invisible from every other client — this is the `voice:state:update` it now sends.
 */

/** The payload `voice:state:update` takes, exactly. */
export interface VoiceStateReport {
  isMuted: boolean;
  isDeafened: boolean;
  isAFK: boolean;
}

/**
 * The three booleans, from the two the shell owns. AFK is always false and is not a
 * placeholder: an app in the background is closed, and the socket goes with it.
 */
export function voiceStateReport(voice: VoiceState): VoiceStateReport {
  return {
    isMuted: voice.muted,
    isDeafened: voice.deafened,
    isAFK: false,
  };
}
