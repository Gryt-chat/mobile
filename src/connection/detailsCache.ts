import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ConnectionState } from "./types";

export type ReadyState = Extract<ConnectionState, { status: "ready" }>;

const key = (host: string) => `serverDetails:${host}`;

/** The channel list this server last sent, so a launch can draw it before the socket answers. */
export async function readCachedDetails(host: string): Promise<ReadyState | null> {
  try {
    const raw = await AsyncStorage.getItem(key(host));
    const parsed: Partial<ReadyState> | null = raw ? JSON.parse(raw) : null;
    if (parsed?.status !== "ready" || !Array.isArray(parsed.channels) || !Array.isArray(parsed.sidebar)) return null;
    return { status: "ready", channels: parsed.channels, sidebar: parsed.sidebar, details: parsed.details, stunHosts: parsed.stunHosts ?? [], cached: true };
  } catch {
    return null;
  }
}

export function cacheDetails(host: string, ready: ReadyState): void {
  void AsyncStorage.setItem(key(host), JSON.stringify(ready)).catch(() => undefined);
}

export function forgetCachedDetails(host: string): Promise<void> {
  return AsyncStorage.removeItem(key(host)).catch(() => undefined);
}
