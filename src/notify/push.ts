import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { shareKeysWithExtension } from "../../modules/push-preview";
import { capabilityIsFresh, parsePushState, type PushState } from "./pushRules";

/**
 * Pushes through push.gryt.chat (GRYT-1656). The phone gets one capability per server,
 * so no server learns another's, and the relay never learns which servers they are.
 */

/** A dev build can point at a relay on this machine with EXPO_PUBLIC_PUSH_RELAY. */
export const PUSH_RELAY = process.env.EXPO_PUBLIC_PUSH_RELAY || "https://push.gryt.chat";
export const ANDROID_CHANNEL = "messages";

const INSTALL_KEY = "gryt:installId";
const STATE_KEY = "gryt:push";

type Fetch = typeof fetch;

async function loadState(): Promise<PushState> {
  return parsePushState(await AsyncStorage.getItem(STATE_KEY));
}

async function saveState(state: PushState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  await shareKeys(state);
}

/** 32 random bytes, base64url: what one server seals this phone's previews to (GRYT-1688). */
function newPreviewKey(): string {
  const bytes = Crypto.getRandomBytes(32);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The extension finds a push's key by the relay's tag, so it's handed the keys that way round. */
async function shareKeys(state: PushState): Promise<void> {
  const byTag: Record<string, string> = {};
  for (const [host, cap] of Object.entries(state.caps)) {
    const key = state.keys[host];
    if (key) byTag[await tagOf(cap)] = key;
  }
  shareKeysWithExtension(byTag);
}

/** This server's preview key, made the first time it's asked for. Kept as long as the capability is. */
export async function previewKeyFor(host: string): Promise<string | null> {
  const state = await loadState();
  if (!state.caps[host]) return null;
  if (state.keys[host]) return state.keys[host];
  const key = newPreviewKey();
  await saveState({ ...state, keys: { ...state.keys, [host]: key } });
  return key;
}

/** Random, kept for the life of the install, and only ever sent to your own servers. */
export async function getInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALL_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID().replace(/-/g, "");
  await AsyncStorage.setItem(INSTALL_KEY, id);
  return id;
}

const TOKEN_TIMEOUT_MS = 20_000;
let tokenOnce: Promise<string | null> | null = null;

/** Shared while it asks. Null when the person said no or the platform didn't answer, and then the next connect asks again. */
export function deviceToken(): Promise<string | null> {
  tokenOnce ??= (async () => {
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
          name: "Messages",
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      let { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "granted" && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
      if (status !== "granted") return null;
      // Apple sometimes never answers, a simulator especially. Null lets the next connect try again.
      const token = await Promise.race([
        Notifications.getDevicePushTokenAsync(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS)),
      ]);
      return token && typeof token.data === "string" ? token.data : null;
    } catch {
      // Android without Firebase set up lands here. Pushes are off, and the rest still works.
      return null;
    }
  })();
  const pending = tokenOnce;
  void pending.then((token) => {
    if (token === null && tokenOnce === pending) tokenOnce = null;
  });
  return pending;
}

/** Development builds talk to Apple's sandbox, release builds to production. */
function apnsEnv(): "sandbox" | "production" {
  return __DEV__ ? "sandbox" : "production";
}

/** This server's capability, asking the relay for one the first time. */
export async function capabilityFor(host: string, token: string, fetchImpl: Fetch = fetch, now = Date.now()): Promise<string | null> {
  let state = await loadState();
  if (state.token !== token) state = { token, caps: {}, issued: {}, keys: {} };
  if (capabilityIsFresh(state, host, now)) return state.caps[host];
  const stale = state.caps[host];
  if (stale) void fetchImpl(`${PUSH_RELAY}/v1/push`, { method: "DELETE", headers: { authorization: `Bearer ${stale}` } }).catch(() => {});

  const res = await fetchImpl(`${PUSH_RELAY}/v1/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: Platform.OS === "ios" ? "ios" : "android", token, env: apnsEnv() }),
  });
  if (!res.ok) return null;
  const { capability } = (await res.json()) as { capability?: string };
  if (typeof capability !== "string") return null;

  const latest = await loadState();
  const same = latest.token === token;
  // A new capability gets a new key, so one the old capability's server held stops opening anything.
  await saveState({
    token,
    caps: { ...(same ? latest.caps : {}), [host]: capability },
    issued: { ...(same ? latest.issued : {}), [host]: now },
    keys: { ...(same ? latest.keys : {}), [host]: newPreviewKey() },
  });
  return capability;
}

/** Tells the relay to drop it too, so a muted server can't wake the phone through it. */
export async function forgetCapability(host: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  const state = await loadState();
  const cap = state.caps[host];
  if (!cap) return null;
  delete state.caps[host];
  delete state.issued[host];
  delete state.keys[host];
  await saveState(state);
  await fetchImpl(`${PUSH_RELAY}/v1/push`, { method: "DELETE", headers: { authorization: `Bearer ${cap}` } }).catch(() => {});
  return cap;
}

export async function hasCapability(host: string): Promise<boolean> {
  return Boolean((await loadState()).caps[host]);
}

/** The relay puts the first 16 hex of the capability's SHA-256 on every notification. */
export async function tagOf(cap: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, cap);
  return hex.slice(0, 16);
}

export async function hostForTag(tag: string): Promise<string | null> {
  const { caps } = await loadState();
  for (const [host, cap] of Object.entries(caps)) if ((await tagOf(cap)) === tag) return host;
  return null;
}

/** Whether the OS still lets this app notify, or can still ask. Rechecked on every return to the app. */
export function useOsAllowsPush(): boolean {
  const [allows, setAllows] = useState(true);
  useEffect(() => {
    const check = () =>
      void Notifications.getPermissionsAsync()
        .then(({ status, canAskAgain }) => setAllows(status === "granted" || canAskAgain))
        .catch(() => {});
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);
  return allows;
}
