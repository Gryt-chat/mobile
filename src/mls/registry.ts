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

/** The full session on `host` now, without subscribing: for a one-off read like counting devices. */
export function sessionOn(host: string): MlsSession | null {
  return asSession(sessions.get(host) ?? null);
}

/** The live session on `host`, read now rather than subscribed, for adding a linked device. */
export function sessionAddingDevicesOn(host: string): Pick<MlsSession, "addOwnDevice" | "groupPositions"> | undefined {
  const source = sessions.get(host);
  return source && "addOwnDevice" in source ? (source as MlsSession) : undefined;
}

/** Resolves with the full session on `host` once one is published, or rejects when `signal` aborts. */
export function waitForMlsSession(host: string, signal: AbortSignal): Promise<MlsSession> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const source = sessions.get(host);
      if (!source || !("ownDevices" in source)) return false;
      stop();
      resolve(source as MlsSession);
      return true;
    };
    const stop = () => {
      listeners.delete(check);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => (stop(), reject(signal.reason));
    if (signal.aborted) return reject(signal.reason);
    if (check()) return;
    listeners.add(check);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function useMlsSource(host: string | null | undefined): MlsSource | null {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return host ? (map.get(host) ?? null) : null;
}
