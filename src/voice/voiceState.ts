import type { VoiceState } from "../shell/ShellContext";

/**
 * What the room is told about you, and what it is allowed to tell you back.
 *
 * The phone kept mute and deafen entirely to itself: `ShellContext` held two
 * booleans, `voiceConfigFrom` turned them into engine settings, and nothing
 * ever put them on the wire. So the microphone really did go quiet, and
 * everybody else's member list carried on drawing an unmuted phone for as long
 * as it was connected. Muting on a phone was invisible from every other client.
 *
 * The desktop has emitted `voice:state:update` from `useSockets.ts` since the
 * beginning, and the server's handler syncs it to the room. This is the phone
 * saying the same sentence.
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

/**
 * Whether an error off the socket is the server refusing to record you unmuted.
 *
 * Somebody with `join_voice` and without `speak` is a listener. The server does
 * not reject their `voice:state:update` — it records them as muted whatever
 * they sent, tells them so, and syncs the corrected state to the room. That
 * leaves the phone as the only client in the call that thinks it is unmuted,
 * with a mute button showing the wrong side of itself.
 *
 * The correction is worth reading rather than ignoring, because the alternative
 * is somebody talking into a microphone the server has already muted.
 */
export function isSpeakDenial(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const error = payload as { error?: unknown; permission?: unknown };
  return error.error === "forbidden" && error.permission === "speak";
}
