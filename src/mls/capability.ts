import type { MlsServerCapability } from "@gryt/core";
import { useSyncExternalStore } from "react";

/* `server:info.mls`, sent on connect and after a settings change. Absent means no MLS there. */
let capabilities: ReadonlyMap<string, MlsServerCapability | null> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => capabilities;

/** Only suite 1 and version 1, which is all this app speaks. */
export function readMlsCapability(value: unknown): MlsServerCapability | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<MlsServerCapability>;
  if (v.version !== 1 || !Array.isArray(v.ciphersuites) || !v.ciphersuites.includes(1)) return null;
  return { version: 1, ciphersuites: v.ciphersuites, retentionDays: Number(v.retentionDays) || 30 };
}

export function setServerMlsCapability(host: string, value: unknown): void {
  const next = readMlsCapability(value);
  const current = capabilities.get(host);
  if (capabilities.has(host) && JSON.stringify(current) === JSON.stringify(next)) return;
  capabilities = new Map(capabilities).set(host, next);
  for (const listener of listeners) listener();
}

/** Undefined until the server has sent `server:info`, null when it has no MLS. */
export function useServerMlsCapability(host: string): MlsServerCapability | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).get(host);
}
