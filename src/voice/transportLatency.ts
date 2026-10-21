import { useEffect, useState } from "react";

/** What @gryt/voice's getTransportLatency gives, all in ms. */
export interface TransportLatency {
  frameMs: number;
  inputMs: number | null;
  outputMs: number | null;
  bufferedByUser: ReadonlyMap<string, number>;
}

/**
 * Mouth to ear per user on the own transport: a capture and a frame, sender to SFU to here (one
 * round trip), their buffer here and this phone's output. It assumes their side looks like ours.
 */
export function estimateByUser(t: TransportLatency, rttMs: number | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const [user, buffered] of t.bufferedByUser) {
    out.set(user, (t.inputMs ?? 0) + t.frameMs + (rttMs ?? 0) + buffered + (t.outputMs ?? 0));
  }
  return out;
}

/** The fields of a WebRTC stats entry this reads. */
export interface StatsEntry {
  type?: string;
  state?: string;
  nominated?: boolean;
  currentRoundTripTime?: number;
}

/** The round trip of the connection WebRTC chose, in ms. It goes to the same SFU host as the voice. */
export function roundTripMs(stats: Iterable<StatsEntry>): number | null {
  for (const pair of stats) {
    if (pair.type === "candidate-pair" && pair.state === "succeeded" && pair.nominated && typeof pair.currentRoundTripTime === "number") {
      return pair.currentRoundTripTime * 1000;
    }
  }
  return null;
}

/** The estimate by user id, once a second while `on`; empty off the transport. */
export function useTransportLatency(
  on: boolean,
  getLatency: () => TransportLatency | null | undefined,
  getStats: () => Promise<ReadonlyMap<string, StatsEntry> | null>,
): ReadonlyMap<string, number> {
  const [estimates, setEstimates] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    if (!on) {
      setEstimates(new Map());
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const latency = getLatency();
      const stats = latency ? await getStats().catch(() => null) : null;
      if (cancelled) return;
      setEstimates(latency ? estimateByUser(latency, stats ? roundTripMs(stats.values()) : null) : new Map());
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [on, getLatency, getStats]);
  return estimates;
}
