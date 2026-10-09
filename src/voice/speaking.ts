import { useEffect, useRef, useState } from "react";

/*
 * Who is speaking, from WebRTC's own stats. The desktop reads Web Audio analysers, which
 * the phone doesn't have; audioLevel on each track is the same signal (0 to 1, linear).
 */

/** Above this a track counts as speech. A quiet room sits around 0.001-0.01. */
export const SPEAKING_LEVEL = 0.03;

/** How long a ring stays on after the voice drops, so it doesn't flicker between words. */
export const HOLD_MS = 350;

type Stat = Record<string, unknown> & { type?: string; kind?: string; mediaType?: string };

/** The level per remote audio track, and the mic's own, from one getStats report. */
export function levelsFrom(
  report: Iterable<[string, unknown]>,
): { mic: number | null; tracks: Map<string, number> } {
  let mic: number | null = null;
  const tracks = new Map<string, number>();
  for (const [, value] of report) {
    const s = value as Stat;
    const audio = s.kind === "audio" || s.mediaType === "audio";
    if (!audio || typeof s.audioLevel !== "number") continue;
    if (s.type === "media-source") mic = Math.max(mic ?? 0, s.audioLevel);
    else if (s.type === "inbound-rtp" && typeof s.trackIdentifier === "string") {
      tracks.set(s.trackIdentifier, Math.max(tracks.get(s.trackIdentifier) ?? 0, s.audioLevel));
    }
  }
  return { mic, tracks };
}

/**
 * Who is speaking right now: "me" for this phone, and remote audio track ids. Polled four
 * times a second while connected, and empty otherwise.
 */
export function useSpeaking(
  connected: boolean,
  getStats: () => Promise<Iterable<[string, unknown]> | null>,
  micOpen: boolean,
): ReadonlySet<string> {
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(new Set());
  const lastHeard = useRef(new Map<string, number>());
  const inputs = useRef({ getStats, micOpen });
  inputs.current = { getStats, micOpen };

  useEffect(() => {
    if (!connected) {
      lastHeard.current.clear();
      setSpeaking(new Set());
      return;
    }
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      const { getStats: read, micOpen: open } = inputs.current;
      void read()
        .then((report) => {
          if (!report) return;
          const now = Date.now();
          const { mic, tracks } = levelsFrom(report);
          if (open && mic !== null && mic > SPEAKING_LEVEL) lastHeard.current.set("me", now);
          for (const [id, level] of tracks) if (level > SPEAKING_LEVEL) lastHeard.current.set(id, now);
          const next = new Set<string>();
          for (const [id, at] of lastHeard.current) if (now - at < HOLD_MS) next.add(id);
          setSpeaking((prev) => (same(prev, next) ? prev : next));
        })
        .catch(() => {
          // A closing connection throws; the next tick or the disconnect clears it.
        })
        .finally(() => {
          busy = false;
        });
    }, 250);
    return () => clearInterval(timer);
  }, [connected]);

  return speaking;
}

function same(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
