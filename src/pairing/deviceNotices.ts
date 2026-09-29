import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MlsOwnDevice } from "@gryt/core";
import { useSyncExternalStore } from "react";

import { addNotices, type DeviceNotice, diffOwnDevices, noticeFor } from "./newDeviceNotice";

/* Where "New device linked" keeps what it knows (GRYT-1576): device ids per server scope, the
   ones this phone linked itself, and the notices still showing in Security. */

const KNOWN = "gryt.pairing.knownDevices:";
const LINKED = "gryt.pairing.linkedHere:";
const NOTICES = "gryt.pairing.deviceNotices";

async function readList(key: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

const writeList = (key: string, ids: string[]) => AsyncStorage.setItem(key, JSON.stringify(ids)).catch(() => undefined);

/** One read-and-write at a time per scope, so a check and a mark can't undo each other. */
const chains = new Map<string, Promise<unknown>>();
function serial<T>(scope: string, job: () => Promise<T>): Promise<T> {
  const next = (chains.get(scope) ?? Promise.resolve()).catch(() => undefined).then(job);
  chains.set(scope, next);
  return next;
}

/** Devices this phone is about to add to its DMs, which it shouldn't then warn itself about. */
export function markLinkedHere(scope: string, ids: string[]): Promise<void> {
  return serial(scope, async () => {
    const linked = (await readList(LINKED + scope)) ?? [];
    await writeList(LINKED + scope, [...new Set([...linked, ...ids])]);
  });
}

let notices: DeviceNotice[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<void> {
  loaded ??= AsyncStorage.getItem(NOTICES)
    .then((raw) => {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) notices = addNotices(notices, parsed.filter(isNotice));
      for (const l of listeners) l();
    })
    .catch(() => undefined);
  return loaded;
}

function isNotice(v: unknown): v is DeviceNotice {
  const n = v as Partial<DeviceNotice> | null;
  return (
    !!n &&
    typeof n.scope === "string" &&
    typeof n.host === "string" &&
    typeof n.deviceId === "string" &&
    (n.name === null || typeof n.name === "string") &&
    typeof n.at === "number"
  );
}

function setNotices(next: DeviceNotice[]) {
  notices = next;
  for (const l of listeners) l();
  void AsyncStorage.setItem(NOTICES, JSON.stringify(next)).catch(() => undefined);
}

export function dismissDeviceNotice(notice: DeviceNotice): void {
  void load().then(() => setNotices(notices.filter((n) => !(n.scope === notice.scope && n.deviceId === notice.deviceId))));
}

export function useDeviceNotices(): DeviceNotice[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      void load();
      return () => void listeners.delete(listener);
    },
    () => notices,
    () => notices,
  );
}

export interface OwnDevicesCheck {
  scope: string;
  host: string;
  list: () => Promise<MlsOwnDevice[]>;
  /** A device nobody here knew about: the toast. */
  onNew?: (notice: DeviceNotice) => void;
}

/** While this phone's own link is past Approve, checks wait: the new device shows up before it's added. */
let held = false;
const deferred = new Map<string, OwnDevicesCheck>();

export function holdDeviceNotices(on: boolean): void {
  if (held === on) return;
  held = on;
  if (on) return;
  const waiting = [...deferred.values()];
  deferred.clear();
  for (const check of waiting) void checkOwnDevices(check);
}

/** Compare this server's device list against what's known, and raise a notice for each new one. */
export function checkOwnDevices(check: OwnDevicesCheck): Promise<void> {
  if (held) {
    deferred.set(check.scope, check);
    return Promise.resolve();
  }
  return serial(check.scope, async () => {
    const devices = await check.list();
    const { fresh, known } = diffOwnDevices(await readList(KNOWN + check.scope), devices, (await readList(LINKED + check.scope)) ?? []);
    await writeList(KNOWN + check.scope, known);
    if (fresh.length === 0) return;

    await load();
    const now = Date.now();
    const made = fresh.map((d) => noticeFor(check.scope, check.host, d, now));
    setNotices(addNotices(notices, made));
    for (const notice of made) check.onNew?.(notice);
  }).catch((e: unknown) => console.warn("[Pairing] Couldn't check for new devices:", e));
}
