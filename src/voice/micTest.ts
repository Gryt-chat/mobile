/**
 * Reading the microphone without an audio graph.
 *
 * The desktop draws its meter from an `AnalyserNode`. A phone has no such
 * thing: `voiceConfigFrom` fills the whole audio section in with constants
 * because the platform's voice-processing unit runs before JavaScript sees
 * anything, and the native platform's pipeline is a passthrough. So there is no
 * spectrum to draw and nothing to tap.
 *
 * What there is instead is WebRTC's own stats. `media-source` carries
 * `audioLevel` for the track being sent, measured by the same code that encodes
 * it, and `outbound-rtp` carries the bytes that left. Those two numbers
 * together answer the question this screen exists for, which is not "how loud
 * am I" but **which half is broken**:
 *
 *   level moves, bytes climb   the microphone works and is being sent
 *   level moves, bytes flat    the microphone works, nothing leaves
 *   level flat, bytes climb    an open microphone hearing nothing
 *   neither moves              never started
 *
 * From inside a call all four look identical — silence — which is why GRYT-943
 * was a day of reading code that turned out not to have changed.
 *
 * **This is a level, not a spectrum.** The bars are the last few seconds of one
 * number, so they move when you speak; they do not say anything about pitch,
 * and the screen says so rather than implying otherwise by looking like an
 * equaliser.
 *
 * Nothing native is imported here. `useMicCheck` opens the microphone and polls;
 * this is the arithmetic, so it can be tested without a phone -- the same split
 * as `pendingSignIn.ts`, and for the same reason: `react-native-webrtc` pulls in
 * `react-native`, whose Flow syntax vitest cannot parse.
 */

/** How many samples the meter keeps. At 100 ms a sample, about 2.4 seconds. */
export const HISTORY = 24;

/**
 * Below this, treat it as silence.
 *
 * `audioLevel` is a linear 0-to-1 amplitude. A muted iPhone microphone reports
 * exactly 0; an open one in a quiet room sits around 0.001 to 0.003, which is
 * the room rather than a voice. Speech from a phone held normally lands between
 * 0.02 and 0.3, so this sits an order of magnitude under the quietest speech
 * and above the noise floor.
 */
export const SILENCE = 0.005;

/** How long to watch before saying nothing is happening. */
export const PATIENCE_MS = 3000;

export interface MicStats {
  /** 0 to 1, from `media-source`. Null when the report has no source yet. */
  level: number | null;
  /** From `outbound-rtp`. Null before the sender exists. */
  bytesSent: number | null;
}

/**
 * Pull the two numbers out of a stats report.
 *
 * `getStats` resolves to a Map on this platform, but it is built from JSON that
 * crossed the bridge, so this takes anything iterable in the same shape rather
 * than insisting on a Map -- and a test can hand it an array of pairs.
 *
 * Audio only. A report from a connection carrying video has `media-source`
 * entries for both, and taking the first would read the camera's frame rate as
 * a microphone level on the day somebody adds video to this screen.
 */
export function readMicStats(report: Iterable<[string, unknown]> | null | undefined): MicStats {
  const out: MicStats = { level: null, bytesSent: null };
  if (!report) return out;

  for (const [, raw] of report) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const kind = entry.kind ?? entry.mediaType;

    if (entry.type === "media-source" && kind === "audio") {
      if (typeof entry.audioLevel === "number") out.level = entry.audioLevel;
    }

    if (entry.type === "outbound-rtp" && kind === "audio") {
      if (typeof entry.bytesSent === "number") out.bytesSent = entry.bytesSent;
    }
  }

  return out;
}

/**
 * The meter's bars, oldest first.
 *
 * Fixed length from the start, so the row does not grow across the screen for
 * the first two seconds and then stop -- an animation that happens once and
 * looks like a bug the second time somebody opens the screen.
 */
export function pushLevel(history: number[], level: number, size = HISTORY): number[] {
  const next = history.length < size ? [...Array(size - history.length).fill(0), ...history] : history;
  return [...next.slice(1), Math.max(0, Math.min(1, level))];
}

/**
 * A bar's height as a fraction, from a linear amplitude.
 *
 * Logarithmic, because linear amplitude is the wrong scale for a meter: normal
 * speech at 0.05 would draw a bar one twentieth of the way up while the top
 * nineteen twentieths were reserved for shouting into the microphone. This maps
 * -60 dB to the floor and 0 dB to the ceiling, which puts speech in the middle
 * where a change in it is visible.
 */
export function barHeight(level: number): number {
  if (level <= 0) return 0;
  const db = 20 * Math.log10(level);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export type Verdict =
  | { state: "starting"; message: string }
  | { state: "blocked"; message: string }
  | { state: "silent"; message: string }
  | { state: "not-sending"; message: string }
  | { state: "working"; message: string };

/**
 * What the readings mean, in a sentence somebody can act on.
 *
 * Separated from the drawing because it is the part worth being sure about, and
 * because "the microphone works, nothing is leaving" is a claim that decides
 * where the next hour goes.
 */
export function micVerdict({
  error,
  history,
  bytesSent,
  firstBytesSent,
  elapsedMs,
}: {
  error: string | null;
  history: number[];
  /** Latest reading. Null before the sender exists. */
  bytesSent: number | null;
  /** The first non-null reading, to compare against. */
  firstBytesSent: number | null;
  elapsedMs: number;
}): Verdict {
  if (error) {
    return { state: "blocked", message: error };
  }

  const heard = history.some((level) => level > SILENCE);
  /* Compared against the first reading rather than against zero. A sender that
     has already sent when this screen opens starts at a number, and "greater
     than zero" would call that progress without a single new packet. */
  const sending =
    bytesSent !== null && firstBytesSent !== null && bytesSent > firstBytesSent;

  if (heard && sending) {
    return { state: "working", message: "The microphone works, and what it hears is being sent." };
  }

  if (elapsedMs < PATIENCE_MS) {
    return { state: "starting", message: "Say something." };
  }

  if (heard && !sending) {
    return {
      state: "not-sending",
      message:
        "The microphone is working. Nothing is leaving the phone, so the fault is in sending rather than in capture.",
    };
  }

  if (!heard && sending) {
    return {
      state: "silent",
      message:
        "The phone is sending, but the microphone is not picking anything up. Check that nothing else has taken it.",
    };
  }

  return {
    state: "silent",
    message: "The microphone is open and completely silent — not even room noise.",
  };
}
