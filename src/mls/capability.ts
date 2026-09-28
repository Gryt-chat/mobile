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

let reportHosts: ReadonlySet<string> = new Set();
const getReportHosts = () => reportHosts;

/** `server:info.mls.reports`: the server takes the reporter's copy of an MLS message (GRYT-1557). */
export function readMlsReports(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { reports?: unknown }).reports === true;
}

/** Only suite 1 and version 1, which is all this app speaks. */
export function readMlsCapability(value: unknown): MlsServerCapability | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<MlsServerCapability>;
  if (v.version !== 1 || !Array.isArray(v.ciphersuites) || !v.ciphersuites.includes(1)) return null;
  return { version: 1, ciphersuites: v.ciphersuites, retentionDays: Number(v.retentionDays) || 30 };
}

export function setServerMlsCapability(host: string, value: unknown): void {
  const taken = readMlsReports(value);
  if (reportHosts.has(host) !== taken) {
    const hosts = new Set(reportHosts);
    if (taken) hosts.add(host);
    else hosts.delete(host);
    reportHosts = hosts;
    for (const listener of listeners) listener();
  }
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

/** Whether this server takes a report of an MLS message. Until it does, Report isn't offered. */
export function useMlsReportsTaken(host: string): boolean {
  return useSyncExternalStore(subscribe, getReportHosts, getReportHosts).has(host);
}
