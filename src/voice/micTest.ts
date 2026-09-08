/**
 * Reading the microphone without an audio graph, from WebRTC's own `media-source` level
 * and `outbound-rtp` bytes — together they answer **which half is broken**.
 *
 * **This is a level, not a spectrum**, and nothing native is imported here.
 */

/** How many samples the meter keeps. At 100 ms a sample, about 2.4 seconds. */
export const HISTORY = 24;

/**
 * Below this, treat it as silence. `audioLevel` is linear 0-to-1: a quiet room sits
 * around 0.001-0.003 and speech between 0.02 and 0.3.
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
 * Pull the two numbers out of a stats report. Takes anything iterable in the Map's
 * shape, so a test can hand it pairs. **Audio only** — video has entries too.
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
 * The meter's bars, oldest first. Fixed length from the start, so the row does not
 * grow across the screen for two seconds and then stop.
 */
export function pushLevel(history: number[], level: number, size = HISTORY): number[] {
  const next = history.length < size ? [...Array(size - history.length).fill(0), ...history] : history;
  return [...next.slice(1), Math.max(0, Math.min(1, level))];
}

/**
 * A bar's height as a fraction, from a linear amplitude. Logarithmic: -60 dB to the
 * floor and 0 dB to the ceiling, which puts speech in the middle.
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
 * What the readings mean, in a sentence somebody can act on. Separated from the
 * drawing, because it is the claim that decides where the next hour goes.
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
  /* Compared against the first reading rather than zero: a sender that has already sent
     starts at a number, and "greater than zero" would call that progress. */
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
