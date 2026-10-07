import type { NotificationLevel } from "../connection/types";
import { quieterOf, resolveLevel, type StoredNotificationPrefs } from "./notificationPrefs";
import type { PushChoice } from "./pushChoice";

export interface PushState {
  /** The device token the capabilities below were made for. A new token voids them all. */
  token: string | null;
  caps: Record<string, string>;
  /** When each was handed out, in ms. Missing reads as long ago. */
  issued: Record<string, number>;
}

/** Swapped for a fresh one this often, so the relay never forgets one a server still holds. */
export const CAPABILITY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

export function parsePushState(raw: string | null): PushState {
  try {
    const value = JSON.parse(raw ?? "") as Partial<PushState>;
    const caps: Record<string, string> = {};
    for (const [host, cap] of Object.entries(value.caps ?? {})) if (typeof cap === "string") caps[host] = cap;
    const issued: Record<string, number> = {};
    for (const [host, at] of Object.entries(value.issued ?? {})) if (typeof at === "number" && caps[host]) issued[host] = at;
    return { token: typeof value.token === "string" ? value.token : null, caps, issued };
  } catch {
    return { token: null, caps: {}, issued: {} };
  }
}

export function capabilityIsFresh(state: PushState, host: string, now: number): boolean {
  const at = state.issued[host];
  return Boolean(state.caps[host]) && at !== undefined && now - at < CAPABILITY_REFRESH_MS;
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

/** Every conversation this phone has at "None" on that server, so the server never sends them. */
export function mutedConversations(
  prefs: StoredNotificationPrefs,
  host: string,
  channels: readonly { id: string; defaultNotificationLevel?: NotificationLevel | null }[],
): string[] {
  const muted = new Set<string>();
  for (const channel of channels) {
    const placement = { channelId: channel.id, defaultLevel: channel.defaultNotificationLevel };
    if (resolveLevel(prefs.servers, host, placement) === "none") muted.add(channel.id);
  }
  // Overrides on things that aren't in the channel list, such as a direct message.
  for (const [id, level] of Object.entries(prefs.servers[host]?.channels ?? {})) {
    if (level === "none") muted.add(id);
  }
  return [...muted].sort();
}

/** Channels this phone hears every message in, with the global ceiling on top, as the desktop resolves it (GRYT-1696). */
export function loudConversations(
  prefs: StoredNotificationPrefs,
  host: string,
  channels: readonly { id: string; defaultNotificationLevel?: NotificationLevel | null }[],
): string[] {
  const loud: string[] = [];
  for (const channel of channels) {
    const placement = { channelId: channel.id, defaultLevel: channel.defaultNotificationLevel };
    if (quieterOf(prefs.global, resolveLevel(prefs.servers, host, placement)) === "all") loud.push(channel.id);
  }
  return loud.sort();
}

export type PushStep = "ask" | "register" | "unregister" | "wait";

/**
 * What to do about one server. Anything short of a yes, with the OS allowing it,
 * takes the capability back, so nothing reaches the relay for it.
 */
export function pushStep(p: {
  level: NotificationLevel;
  choice: PushChoice | undefined;
  /** False once the OS says no and won't ask again. */
  osAllows: boolean;
  /** Only the server on screen asks, or joining five servers would ask five times. */
  onScreen: boolean;
}): PushStep {
  if (p.level === "none" || p.choice === "no" || !p.osAllows) return "unregister";
  if (p.choice === "yes") return "register";
  return p.onScreen ? "ask" : "wait";
}
