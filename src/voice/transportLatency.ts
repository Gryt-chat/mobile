import { useEffect, useState } from "react";

/** What @gryt/voice's getTransportLatency gives that the call sheet shows, in ms (GRYT-1836). */
export interface TransportLatency {
  rttByUser: ReadonlyMap<string, number>;
  bufferedByUser: ReadonlyMap<string, number>;
  /** The audio session's real rate. Below 48000 the voice is band-limited. */
  sampleRate?: number | null;
}

/** Measured per person: the round trip through the SFU to them and back, and how much of theirs waits here. */
export interface PersonLatency {
  rttMs: number | null;
  bufferedMs: number | null;
}

export interface CallLatency {
  byUser: ReadonlyMap<string, PersonLatency>;
  sampleRate: number | null;
}

const NONE: CallLatency = { byUser: new Map(), sampleRate: null };

export function measuredByUser(t: TransportLatency): Map<string, PersonLatency> {
  const users = new Set([...t.rttByUser.keys(), ...t.bufferedByUser.keys()]);
  return new Map([...users].map((user) => [user, { rttMs: t.rttByUser.get(user) ?? null, bufferedMs: t.bufferedByUser.get(user) ?? null }]));
}

/** The measurements by user id and the session's rate, once a second while `on`; empty off the transport. */
export function useTransportLatency(on: boolean, getLatency: () => TransportLatency | null | undefined): CallLatency {
  const [latency, setLatency] = useState<CallLatency>(NONE);
  useEffect(() => {
    if (!on) {
      setLatency(NONE);
      return;
    }
    const poll = () => {
      const t = getLatency();
      setLatency(t ? { byUser: measuredByUser(t), sampleRate: t.sampleRate ?? null } : NONE);
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
  }, [on, getLatency]);
  return latency;
}
