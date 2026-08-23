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
 * Told once that these are notification sounds, not media.
 *
 * Without it a sound played during a call takes the audio session with it: iOS
 * treats a fresh player as playback, which pauses the call's session for as
 * long as the chime lasts and leaves the route on the speaker afterwards.
 * `playsInSilentMode: false` is deliberate too — a phone on silent should be
 * silent, and a chat notification is exactly the thing that switch is for.
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
  configured = true;
  await api.setAudioModeAsync({
    playsInSilentMode: false,
    /* Ducks the call rather than interrupting it, so a message arriving while
     * somebody is talking lowers them for a moment instead of cutting them. */
    interruptionMode: "duckOthers",
    interruptionModeAndroid: "duckOthers",
    shouldPlayInBackground: false,
  }).catch(() => {
    /* An audio session that will not configure is not a reason to lose the
     * sound — the defaults are survivable, and the alternative is a chat app
     * that throws because a chime could not be set up. */
  });
}

/**
 * Play one, at once, without waiting for it to finish.
 *
 * Fire and forget on purpose: a caller is a socket handler, and a sound that
 * made the handler async would put the chime in the same queue as the message
 * it is announcing.
 */
export function playSound(sound: Sound): void {
  void (async () => {
    try {
      const api = audio();
      if (!api) return;
      await configure(api);

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
