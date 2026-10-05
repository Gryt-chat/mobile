/* A line a second about the call, kept for the bug report. Voice that works for a second and
   then stops (GRYT-1649) needs evidence from the phone it happens on: which way it stops. */

export interface CallSample {
  /** What this phone has sent, and how loud its microphone is. */
  outPackets: number | null;
  outLevel: number | null;
  /** Everything arriving, summed over the people in the call. */
  inPackets: number | null;
  inLevel: number | null;
  inConcealed: number | null;
  rttMs: number | null;
}

export interface SessionNote {
  category: string;
  mode: string;
  outputs: string[];
  webRTCActive: boolean;
}

type Stat = Record<string, unknown> & { type?: string; kind?: string; mediaType?: string };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
const isAudio = (s: Stat) => s.kind === "audio" || s.mediaType === "audio";

/** The audio half of a getStats report, which is all this phone's voice depends on. */
export function readCallSample(report: Iterable<[string, unknown]> | Map<string, unknown>): CallSample {
  const sample: CallSample = { outPackets: null, outLevel: null, inPackets: null, inLevel: null, inConcealed: null, rttMs: null };
  for (const [, value] of report as Iterable<[string, unknown]>) {
    const s = value as Stat;
    if (s.type === "outbound-rtp" && isAudio(s)) sample.outPackets = add(sample.outPackets, num(s.packetsSent));
    else if (s.type === "media-source" && isAudio(s)) sample.outLevel = num(s.audioLevel) ?? sample.outLevel;
    else if (s.type === "inbound-rtp" && isAudio(s)) {
      sample.inPackets = add(sample.inPackets, num(s.packetsReceived));
      sample.inConcealed = add(sample.inConcealed, num(s.concealedSamples));
      const level = num(s.audioLevel);
      if (level !== null) sample.inLevel = Math.max(sample.inLevel ?? 0, level);
    } else if (s.type === "candidate-pair" && s.state === "succeeded" && s.nominated === true) {
      const rtt = num(s.currentRoundTripTime);
      if (rtt !== null) sample.rttMs = Math.round(rtt * 1000);
    }
  }
  return sample;
}

const delta = (now: number | null, before: number | null | undefined) =>
  now === null ? "?" : before === null || before === undefined ? String(now) : `+${now - before}`;
const level = (v: number | null) => (v === null ? "?" : v.toFixed(2));

/** One line: what went out and came in since the last one, and what the audio session says. */
export function formatSample(secs: number, now: CallSample, before: CallSample | null, session: SessionNote | null): string {
  const parts = [
    `+${secs}s`,
    `out ${delta(now.outPackets, before?.outPackets)}pk mic ${level(now.outLevel)}`,
    `in ${delta(now.inPackets, before?.inPackets)}pk lvl ${level(now.inLevel)} hid ${delta(now.inConcealed, before?.inConcealed)}`,
    `rtt ${now.rttMs ?? "?"}ms`,
  ];
  if (session) {
    const category = session.category.replace(/^AVAudioSessionCategory/, "");
    const mode = session.mode.replace(/^AVAudioSessionMode/, "");
    parts.push(`ios ${category}/${mode} ${session.outputs.join("+") || "none"}${session.webRTCActive ? "" : " webrtc-off"}`);
  }
  return parts.join(" | ");
}

const MAX_LINES = 150;
let lines: string[] = [];

/** The current or last call's lines, newest last, for the report's log. */
export function callTimeline(): string[] {
  return lines.slice();
}

/**
 * Samples once a second until stopped. A new call starts a new timeline, so a report says
 * what happened in the call it was sent from or the one just before.
 */
export function startCallRecorder(
  getStats: () => Promise<Iterable<[string, unknown]> | Map<string, unknown> | null>,
  session: () => SessionNote | null,
  platform: string,
): () => void {
  const started = Date.now();
  lines = [`call started ${new Date(started).toISOString()} on ${platform}`];
  let before: CallSample | null = null;
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void getStats()
      .then((report) => {
        if (!report) return;
        const now = readCallSample(report);
        lines.push(formatSample(Math.round((Date.now() - started) / 1000), now, before, session()));
        if (lines.length > MAX_LINES) lines = [lines[0], ...lines.slice(-(MAX_LINES - 1))];
        before = now;
      })
      .catch(() => {
        // A connection that is closing throws; the next tick or the stop says the rest.
      })
      .finally(() => {
        busy = false;
      });
  }, 1000);
  return () => {
    clearInterval(timer);
    lines.push(`call ended after ${Math.round((Date.now() - started) / 1000)}s`);
  };
}
