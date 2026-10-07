import type { NotificationLevel } from "../connection/types";
import { quieterOf, type StoredNotificationPrefs } from "./notificationPrefs";

export interface PushState {
  /** The device token the capabilities below were made for. A new token voids them all. */
  token: string | null;
  caps: Record<string, string>;
}

export function parsePushState(raw: string | null): PushState {
  try {
    const value = JSON.parse(raw ?? "") as Partial<PushState>;
    const caps: Record<string, string> = {};
    for (const [host, cap] of Object.entries(value.caps ?? {})) if (typeof cap === "string") caps[host] = cap;
    return { token: typeof value.token === "string" ? value.token : null, caps };
  } catch {
    return { token: null, caps: {} };
  }
}

/** "None" for a server, or everywhere, means it shouldn't be able to wake the phone at all. */
export function pushLevel(prefs: StoredNotificationPrefs, host: string): NotificationLevel {
  return quieterOf(prefs.global, prefs.servers[host]?.server ?? "all");
}

/** Only a phone really in the background counts. "inactive" is the control centre pulled down. */
export function isBackground(state: string): boolean {
  return state === "background";
}

/** Where the relay's server tag ends up, which differs by platform and by app state. */
export function tagFromResponse(response: unknown): string | null {
  const request = (response as { notification?: { request?: Record<string, unknown> } } | null)?.notification?.request;
  if (!request) return null;
  const content = request.content as { data?: Record<string, unknown> } | undefined;
  const trigger = request.trigger as { payload?: Record<string, unknown>; remoteMessage?: { data?: Record<string, unknown> } } | undefined;
  const candidates = [content?.data?.c, trigger?.payload?.c, trigger?.remoteMessage?.data?.c];
  const tag = candidates.find((c) => typeof c === "string" && /^[0-9a-f]{16}$/.test(c));
  return typeof tag === "string" ? tag : null;
}
