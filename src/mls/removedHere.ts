import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DmSealingMode } from "@gryt/core";

import type { MlsSource } from "./session";

/*
 * Servers that removed this phone from MLS (GRYT-1555). Until the person signs in again, or
 * restores their identity from its words, no new device is made there. The desktop has the same.
 */

const PREFIX = "gryt.mls.removed:";
const cleared = new Set<() => void>();

/** Fires after a restore clears every server, so each one's MLS starts again. */
export function onRemovedCleared(listener: () => void): () => void {
  cleared.add(listener);
  return () => {
    cleared.delete(listener);
  };
}

/** Milliseconds, or null when this phone wasn't removed on that server. */
export async function removedHereAt(scope: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + scope);
    const at = raw === null ? NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export async function markRemovedHere(scope: string, at = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + scope, String(at));
  } catch {
    // Without storage the wipe still happens; only the gate on a new device is lost.
  }
}

export async function clearRemovedHere(scope: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + scope);
  } catch {
    // Nothing to clear.
  }
}

/** After restoring an identity from its words, which a thief doesn't have. */
export async function clearRemovedEverywhere(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing to clear.
  }
  for (const listener of cleared) listener();
}

/** A sign-in after the removal lets the phone set up again. `authTime` is the token's, in seconds. */
export function stillRemoved(removedAt: number, authTime: number | null): boolean {
  return authTime === null || authTime * 1000 <= removedAt;
}

/** The `auth_time` claim of an account token, or null for a guest or a token without one. */
export function authTimeOf(token: string | undefined | null): number | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { auth_time?: unknown };
    return typeof json.auth_time === "number" ? json.auth_time : null;
  } catch {
    return null;
  }
}

/** DMs on a server that removed this phone: version 1 to a peer without MLS, and nothing else. */
export function removedSource(base: MlsSource): MlsSource & { removedHere: true } {
  const refused: DmSealingMode = { kind: "refused", reason: "no_own_device" };
  return {
    removedHere: true,
    storeScope: base.storeScope,
    async modeFor(conversationId, peer) {
      const mode = await base.modeFor(conversationId, peer).catch(() => refused);
      return mode.kind === "sealed-v1" ? mode : refused;
    },
    send: () =>
      Promise.reject(Object.assign(new Error("This phone was removed from encrypted DMs on this server."), { code: "device_removed" })),
    problems: () => ({ undecryptable: 0, lost: "device_removed" }),
    waiting: () => false,
    onChange: base.onChange,
  };
}
