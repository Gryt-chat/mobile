import { useSyncExternalStore } from "react";

import type { MlsSession } from "./session";

/* The MLS session for each connected server. Made where the socket is, read by the DM screen. */
let sessions: ReadonlyMap<string, MlsSession> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => sessions;

export function publishMlsSession(host: string, session: MlsSession | null): void {
  const next = new Map(sessions);
  if (session) next.set(host, session);
  else next.delete(host);
  sessions = next;
  for (const listener of listeners) listener();
}

export function useMlsSession(host: string | null | undefined): MlsSession | null {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return host ? (map.get(host) ?? null) : null;
}
