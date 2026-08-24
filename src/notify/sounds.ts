import type { AudioPlayer } from "expo-audio";

/**
 * The three sounds the desktop plays, on a phone.
 *
 * The same files, from `packages/client/src/packages/audio/src/assets` — a
 * message arriving, somebody joining a call, somebody leaving one. Sharing the
 * files rather than picking new ones is the point: the two clients should sound
 * like one product, and a person who uses both should not have to learn a second
 * set of chimes.
 *
 * **Nothing here decides *when* to play.** That is the caller's, because the
 * rules differ per sound and are about the app rather than about audio: whose
 * message it was, which server it arrived on, whether the call is yours. This
 * file owns loading, volume and the awkward parts of playing audio during a
 * voice call, and nothing else.
 *
 * **`expo-audio` is reached lazily, and that is not a style choice.** Imported
 * at the top it is evaluated when this module is, which is when
 * `ConnectionsProvider` is — so a build whose native side does not have
 * `ExpoAudio` does not lose the chime, it fails to start at all with "Cannot
 * find native module 'ExpoAudio'". Seen on a dev client one build behind.
 *
 * A released build always has it, so this is about the builds in between: the
 * two local modules in `modules/` reach for `requireOptionalNativeModule` for
 * the same reason, and a missing sound should cost a sound.
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
 * The first version of this said the opposite, and was wrong twice.
 *
 * It passed `playsInSilentMode: false` with `interruptionMode: "duckOthers"`,
 * which `expo-audio` rejects outright: `AudioUtils.validateAudioMode` throws
 * "playsInSilentMode == false and duckOthers == true cannot be set on iOS".
 * The `catch` below swallowed it and `configured` was set before the await, so
 * it never retried. None of this had ever run on a phone.
 *
 * And it was the throw that was keeping calls alive. `setAudioMode` ends in
 * `session.setCategory(...)` on the **shared** `AVAudioSession` — the one
 * WebRTC has in `playAndRecord` for the duration of a call. Every reachable
 * combination moves it somewhere else: `playsInSilentMode: false` gives
 * `.ambient`, `true` gives `.playback`. Either takes the microphone out from
 * under the call, on the first message that arrives while somebody is in one.
 *
 * So the rule is when, not what. Outside a call this is free — WebRTC sets its
 * own category when a call starts, so nothing here survives to interfere. GRYT-578,
 * and the same root as GRYT-576: reconfiguring a shared session underneath its owner.
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
 * Play one, at once, without waiting for it to finish.
 *
 * Fire and forget on purpose: a caller is a socket handler, and a sound that
 * made the handler async would put the chime in the same queue as the message
 * it is announcing.
 *
 * **`inCall` is not a nicety.** It is what stops this reconfiguring the audio
 * session a call is holding. Callers know; this file does not.
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
