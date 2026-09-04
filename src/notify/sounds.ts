import type { AudioPlayer } from "expo-audio";

/**
 * The three sounds the desktop plays, on a phone — **the same files**, so a
 * person who uses both clients does not learn a second set of chimes.
 *
 * **Nothing here decides *when* to play.** That is the caller's: the rules
 * differ per sound and are about the app rather than about audio.
 *
 * **`expo-audio` is reached lazily, and that is not a style choice.** Imported
 * at the top it is evaluated with `ConnectionsProvider`, so a build whose
 * native side lacks `ExpoAudio` does not lose the chime — it fails to start at
 * all. A missing sound should cost a sound.
 */

export type Sound = "message" | "connect" | "disconnect";

const FILES: Record<Sound, number> = {
  message: require("../../assets/sounds/message.mp3"),
  connect: require("../../assets/sounds/connect.mp3"),
  disconnect: require("../../assets/sounds/disconnect.mp3"),
};

/**
 * One player per sound, made on first use and kept.
 *
 * Creating one per play works and leaks: a player holds a decoder, and a busy
 * channel would make one every time somebody typed. Keeping three means the
 * file is decoded once and a replay is a seek to zero.
 */
const players = new Map<Sound, AudioPlayer>();

let configured = false;

/**
 * Told once that these are notification sounds, not media — and **only when
 * there is no call running**.
 *
 * `setAudioMode` ends in `session.setCategory(...)` on the **shared**
 * `AVAudioSession`, the one WebRTC holds in `playAndRecord` for the duration of
 * a call. Every reachable combination moves it somewhere else, and either takes
 * the microphone out from under the call on the first message that arrives.
 *
 * **So the rule is when, not what.** Outside a call this is free, since WebRTC
 * sets its own category when one starts. GRYT-578, same root as GRYT-576:
 * reconfiguring a shared session underneath its owner.
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
      /* A valid pair, unlike the last one. `doNotMix` rather than `duckOthers`
       * because iOS refuses to duck a session that is not playing in silent
       * mode, and a phone on silent should be silent — a chat notification is
       * exactly what that switch is for. */
      playsInSilentMode: false,
      interruptionMode: "doNotMix",
      interruptionModeAndroid: "duckOthers",
      shouldPlayInBackground: false,
    });
    /* Only on success. Set before the await, a rejection would be remembered as
     * "done" and never tried again — which is how the broken version stayed
     * broken silently. */
    configured = true;
  } catch {
    /* An audio session that will not configure is not a reason to lose the
     * sound — the defaults are survivable, and the alternative is a chat app
     * that throws because a chime could not be set up. */
  }
}

/**
 * Play one at once, without waiting. Fire and forget, because a caller is a
 * socket handler and an async one would queue the chime behind the message it
 * announces. **`inCall` is not a nicety** — it stops this reconfiguring the
 * audio session a call is holding.
 */
export function playSound(sound: Sound, options: { inCall?: boolean } = {}): void {
  void (async () => {
    try {
      const api = audio();
      if (!api) return;
      /* Not while a call is running. See `configure` — every audio mode this
       * can ask for moves the shared session off `playAndRecord`, and the call
       * is what is using it. */
      if (!options.inCall) await configure(api);

      let player = players.get(sound);
      if (!player) {
        player = api.createAudioPlayer(FILES[sound]);
        players.set(sound, player);
      }

      /* Back to the start every time. A player that has finished sits at the
       * end, and playing it again from there is silence — which reads as the
       * second notification not working. */
      await player.seekTo(0);
      player.play();
    } catch {
      /* A sound is the least important thing happening. Nothing about a failed
       * chime is worth a toast or a thrown error in a socket handler. */
    }
  })();
}
