import { useSyncExternalStore } from "react";

import type { MlsSession, MlsSource } from "./session";

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

/** The full session, once the archive is open and this phone isn't removed there. */
export function asSession(source: MlsSource | null): MlsSession | null {
  return source && "ownDevices" in source ? (source as MlsSession) : null;
}

export function isRemovedHere(source: MlsSource | null): boolean {
  return !!source && "removedHere" in source;
}

/** The live session on `host`, read now rather than subscribed, for adding a linked device. */
export function sessionAddingDevicesOn(host: string): Pick<MlsSession, "addOwnDevice"> | undefined {
  const source = sessions.get(host);
  return source && "addOwnDevice" in source ? (source as MlsSession) : undefined;
}

export function useMlsSource(host: string | null | undefined): MlsSource | null {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return host ? (map.get(host) ?? null) : null;
}
