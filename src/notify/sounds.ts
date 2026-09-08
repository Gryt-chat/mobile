import type { AudioPlayer } from "expo-audio";

/**
 * The three sounds the desktop plays, on a phone, from the same files. `expo-audio` is
 * reached lazily: imported at the top, a build missing it fails to start.
 */

export type Sound = "message" | "connect" | "disconnect";

const FILES: Record<Sound, number> = {
  message: require("../../assets/sounds/message.mp3"),
  connect: require("../../assets/sounds/connect.mp3"),
  disconnect: require("../../assets/sounds/disconnect.mp3"),
};

/**
 * One player per sound, made on first use and kept. A player holds a decoder, so
 * one per play would make one every time somebody typed.
 */
const players = new Map<Sound, AudioPlayer>();

let configured = false;

/**
 * Told once that these are notification sounds, and only with no call running:
 * `setAudioMode` ends in `setCategory` on the session WebRTC holds (GRYT-578).
 */
type Audio = typeof import("expo-audio");

/** Null where the native side does not have it. Never throws. */
function audio(): Audio | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-audio") as Audio;
  } catch {
    return null;
  }
}

async function configure(api: Audio): Promise<void> {
  if (configured) return;

  try {
    await api.setAudioModeAsync({
      /* A valid pair, unlike the last one. `doNotMix` rather than `duckOthers`,
       * because iOS refuses to duck in silent mode and silent should be silent. */
      playsInSilentMode: false,
      interruptionMode: "doNotMix",
      interruptionModeAndroid: "duckOthers",
      shouldPlayInBackground: false,
    });
    /* Only on success. Set before the await, a rejection would be remembered as
     * "done" and never tried again. */
    configured = true;
  } catch {
    /* An audio session that will not configure is not a reason to lose the sound:
     * the defaults are survivable. */
  }
}

/**
 * Play one at once, without waiting — a caller is a socket handler, and an async one
 * would queue the chime behind the message. **`inCall` is not a nicety.**
 */
export function playSound(sound: Sound, options: { inCall?: boolean } = {}): void {
  void (async () => {
    try {
      const api = audio();
      if (!api) return;
      /* Not while a call is running: every audio mode this can ask for moves the
       * shared session off `playAndRecord`. */
      if (!options.inCall) await configure(api);

      let player = players.get(sound);
      if (!player) {
        player = api.createAudioPlayer(FILES[sound]);
        players.set(sound, player);
      }

      /* Back to the start every time. A player that has finished sits at the end,
       * and playing from there is silence. */
      await player.seekTo(0);
      player.play();
    } catch {
      /* A sound is the least important thing happening. Nothing about a failed
       * chime is worth a toast or a thrown error in a socket handler. */
    }
  })();
}
