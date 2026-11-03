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

/* The desktop's presets (GRYT-2010), with the same ids, from the same files. */

export interface SoundPreset {
  id: string;
  label: string;
  file: number;
}

/** The first of each list is the default, which is stored as no choice at all. */
export const MESSAGE_SOUNDS: readonly SoundPreset[] = [
  { id: "click", label: "Click", file: require("../../assets/sounds/message.mp3") },
  { id: "chime", label: "Chime", file: require("../../assets/sounds/message-chime.mp3") },
  { id: "soft", label: "Soft", file: require("../../assets/sounds/message-soft.mp3") },
  { id: "bright", label: "Bright", file: require("../../assets/sounds/message-bright.mp3") },
  { id: "boing", label: "Boing", file: require("../../assets/sounds/message-boing.mp3") },
  { id: "scanner", label: "Scanner", file: require("../../assets/sounds/message-scanner.mp3") },
  { id: "microwave", label: "Microwave", file: require("../../assets/sounds/message-microwave.mp3") },
];

export const RINGTONES: readonly SoundPreset[] = [
  { id: "classic", label: "Classic", file: require("../../assets/sounds/ring-classic.mp3") },
  { id: "bright", label: "Bright", file: require("../../assets/sounds/ring-bright.mp3") },
  { id: "warm", label: "Warm", file: require("../../assets/sounds/ring-warm.mp3") },
  { id: "nineties", label: "Nineties", file: require("../../assets/sounds/ring-nineties.mp3") },
  { id: "desk-phone", label: "Desk phone", file: require("../../assets/sounds/ring-desk-phone.mp3") },
  { id: "old-phone", label: "Old phone", file: require("../../assets/sounds/ring-old-phone.mp3") },
];

/** An unknown id, from a later version, plays the default rather than nothing. */
export function presetFile(id: string | null, presets: readonly SoundPreset[]): number {
  return (presets.find((p) => p.id === id) ?? presets[0]).file;
}

/**
 * One player per sound, made on first use and kept. A player holds a decoder, so
 * one per play would make one every time somebody typed.
 */
const players = new Map<string, AudioPlayer>();

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
export function playSound(sound: Sound, options: { inCall?: boolean; file?: number } = {}): void {
  void (async () => {
    try {
      const api = audio();
      if (!api) return;
      /* Not while a call is running: every audio mode this can ask for moves the
       * shared session off `playAndRecord`. */
      if (!options.inCall) await configure(api);

      /* In a call the session belongs to the call: expo-audio deactivates it 100 ms after a
       * chime ends, and the native voice engine's mic stops with it (GRYT-1822). */
      const inCall = options.inCall ?? false;
      const file = options.file ?? FILES[sound];
      const key = `${file}:${inCall}`;
      let player = players.get(key);
      if (!player) {
        player = api.createAudioPlayer(file, { keepAudioSessionActive: inCall });
        players.set(key, player);
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

/** Plays on repeat, as a ringtone does, until the returned function is called. */
export function startRingtone(file: number, options: { inCall?: boolean } = {}): () => void {
  let player: AudioPlayer | null = null;
  let stopped = false;
  void (async () => {
    try {
      const api = audio();
      if (!api) return;
      const inCall = options.inCall ?? false;
      if (!inCall) await configure(api);
      if (stopped) return;
      player = api.createAudioPlayer(file, { keepAudioSessionActive: inCall });
      player.loop = true;
      player.play();
    } catch {
      // Same as a chime: the card still shows the call.
    }
  })();
  return () => {
    stopped = true;
    try {
      player?.pause();
      player?.remove();
    } catch {
      // Already gone.
    }
  };
}
