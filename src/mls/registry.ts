import { useSyncExternalStore } from "react";

import type { MlsSource } from "./session";

/* What answers for MLS on each connected server: the session, or the mode-only source. */
let sessions: ReadonlyMap<string, MlsSource> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => sessions;

export function publishMlsSource(host: string, session: MlsSource | null): void {
  const next = new Map(sessions);
  if (session) next.set(host, session);
  else next.delete(host);
  sessions = next;
  for (const listener of listeners) listener();
}

export function useMlsSource(host: string | null | undefined): MlsSource | null {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return host ? (map.get(host) ?? null) : null;
}
