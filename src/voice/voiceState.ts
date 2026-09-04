import type { VoiceState } from "../shell/ShellContext";

/**
 * What the room is told about you, and what it is allowed to tell you back.
 * The phone kept mute and deafen to itself — the microphone went quiet and
 * everybody else's member list carried on drawing an unmuted phone, so muting
 * was invisible from every other client. This is the phone emitting the
 * `voice:state:update` the desktop always has.
 */

/** The payload `voice:state:update` takes, exactly. */
export interface VoiceStateReport {
  isMuted: boolean;
  isDeafened: boolean;
  isAFK: boolean;
}

/**
 * The three booleans, from the two the shell owns.
 *
 * **AFK is always false, and that is not a placeholder for a bug.** The desktop
 * derives it from a window that has not been touched, which a phone does not
 * have — an app in the background is not idle, it is closed, and the socket
 * goes with it. Sending `false` is the honest answer to a question this client
 * cannot answer; a phone that could go AFK would need a source for it first.
 */
export function voiceStateReport(voice: VoiceState): VoiceStateReport {
  return {
    isMuted: voice.muted,
    isDeafened: voice.deafened,
    isAFK: false,
  };
}
