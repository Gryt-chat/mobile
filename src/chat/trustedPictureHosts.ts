import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

/* Sites whose link pictures load without asking, on this device (GRYT-1189). The desktop's
   "Always load from" list, kept apart from it: the two devices don't share settings. */

const KEY = "gryt:trustedPictureHosts";
const listeners = new Set<(hosts: readonly string[]) => void>();
let hosts: readonly string[] = [];
let loaded: Promise<void> | null = null;

function load(): Promise<void> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      hosts = Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string") : [];
      listeners.forEach((fn) => fn(hosts));
    })
    .catch(() => {});
  return loaded;
}

export async function trustPictureHost(host: string): Promise<void> {
  await load();
  if (hosts.includes(host)) return;
  hosts = [...hosts, host];
  listeners.forEach((fn) => fn(hosts));
  await AsyncStorage.setItem(KEY, JSON.stringify(hosts)).catch(() => {});
}

export async function forgetPictureHost(host: string): Promise<void> {
  await load();
  hosts = hosts.filter((h) => h !== host);
  listeners.forEach((fn) => fn(hosts));
  await AsyncStorage.setItem(KEY, JSON.stringify(hosts)).catch(() => {});
}

export function useTrustedPictureHosts(): readonly string[] {
  const [list, setList] = useState(hosts);
  useEffect(() => {
    listeners.add(setList);
    void load();
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}

/** The host a link's preview picture belongs to, for trusting it. */
export function pictureHostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
