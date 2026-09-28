import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import type { Channel, NotificationLevel } from "../connection/types";

/**
 * How loud each server and channel is, on this phone (GRYT-1534). Local only, and
 * most-specific-wins under a global ceiling that can only quieten, like the desktop's.
 */

export interface ServerNotificationPrefs {
  server?: NotificationLevel;
  channels?: Record<string, NotificationLevel>;
}

export type NotificationPrefsByHost = Record<string, ServerNotificationPrefs>;

export interface StoredNotificationPrefs {
  global: NotificationLevel;
  servers: NotificationPrefsByHost;
}

const LOUDNESS: Record<NotificationLevel, number> = { all: 2, mentions: 1, none: 0 };

/** The quieter of two levels. The global ceiling is applied with this. */
export function quieterOf(a: NotificationLevel, b: NotificationLevel): NotificationLevel {
  return LOUDNESS[a] <= LOUDNESS[b] ? a : b;
}

/** Whether the global level is the one actually deciding, so a menu can say so. */
export function globalOverrules(global: NotificationLevel, resolved: NotificationLevel): boolean {
  return LOUDNESS[global] < LOUDNESS[resolved];
}

const isLevel = (v: unknown): v is NotificationLevel => v === "all" || v === "mentions" || v === "none";

const KEY = "gryt:notificationPrefs";

/** Drops anything unrecognised. Failing to "all": hearing nothing looks like a quiet day. */
export function parsePrefsByHost(raw: unknown): NotificationPrefsByHost {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: NotificationPrefsByHost = {};
  for (const [host, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!host || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const scope = value as Record<string, unknown>;
    const entry: ServerNotificationPrefs = {};
    if (isLevel(scope.server)) entry.server = scope.server;
    const bag = scope.channels;
    if (bag && typeof bag === "object" && !Array.isArray(bag)) {
      const kept: Record<string, NotificationLevel> = {};
      for (const [id, level] of Object.entries(bag as Record<string, unknown>)) {
        if (id && isLevel(level)) kept[id] = level;
      }
      if (Object.keys(kept).length > 0) entry.channels = kept;
    }
    if (entry.server || entry.channels) out[host] = entry;
  }
  return out;
}

export function parseStoredPrefs(raw: unknown): StoredNotificationPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { global: "all", servers: {} };
  const outer = raw as Record<string, unknown>;
  return {
    global: isLevel(outer.global) ? outer.global : "all",
    servers: parsePrefsByHost(outer.servers),
  };
}

/** Only what the resolver needs from a channel: its id, and what the server set for it. */
export interface ChannelPlacement {
  channelId: string;
  defaultLevel?: NotificationLevel | null;
}

/** This channel's own answer, else what it inherits. No global ceiling — that
    quietens for a different reason (whether anything actually makes noise). */
export function resolveLevel(
  prefs: NotificationPrefsByHost,
  host: string,
  placement: ChannelPlacement | null,
): NotificationLevel {
  const own = placement ? prefs[host]?.channels?.[placement.channelId] : undefined;
  if (own) return own;
  return inheritedLevel(prefs, host, placement);
}

/** What "Default" means for a channel: its server, quietened by its own default.
    A level this build does not know reads as everything, same as an older server. */
export function inheritedLevel(prefs: NotificationPrefsByHost, host: string, placement: ChannelPlacement | null): NotificationLevel {
  const inherited = prefs[host]?.server ?? "all";
  const preset = placement?.defaultLevel;
  return preset && isLevel(preset) ? quieterOf(inherited, preset) : inherited;
}

export function shouldAnnounceMessage(level: NotificationLevel): boolean {
  return level === "all";
}

export function shouldAnnounceMention(level: NotificationLevel): boolean {
  return level === "all" || level === "mentions";
}

// ── The store, module scope and useSyncExternalStore, like contactPrefs.ts next door ──

let stored: StoredNotificationPrefs = parseStoredPrefs(null);
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/* Read once at start. Until it lands the defaults hold, which is what a new phone has. */
export const notificationPrefsLoaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    stored = parseStoredPrefs(raw ? JSON.parse(raw) : null);
    emit();
  })
  .catch(() => {});

function commit(next: StoredNotificationPrefs): void {
  stored = next;
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify(stored)).catch(() => {
    // Holds for this session.
  });
}

export function subscribeNotificationPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoredNotificationPrefs(): StoredNotificationPrefs {
  return stored;
}

export function getGlobalLevel(): NotificationLevel {
  return stored.global;
}

export function setGlobalLevel(level: NotificationLevel): void {
  if (stored.global === level) return;
  commit({ ...stored, global: level });
}

export type NotificationScope = { kind: "server" } | { kind: "channel"; id: string };

/** What a scope is set to outright, ignoring anything it would inherit. */
export function getOwnLevel(host: string, scope: NotificationScope): NotificationLevel | null {
  const entry = stored.servers[host];
  if (!entry) return null;
  if (scope.kind === "server") return entry.server ?? null;
  return entry.channels?.[scope.id] ?? null;
}

/** Set one scope, or clear it with null so it inherits again. */
export function setNotificationLevel(host: string, scope: NotificationScope, level: NotificationLevel | null): void {
  const next: NotificationPrefsByHost = { ...stored.servers };
  const entry: ServerNotificationPrefs = { ...(next[host] ?? {}) };

  if (scope.kind === "server") {
    if (level) entry.server = level;
    else delete entry.server;
  } else {
    const bag = { ...(entry.channels ?? {}) };
    if (level) bag[scope.id] = level;
    else delete bag[scope.id];
    if (Object.keys(bag).length > 0) entry.channels = bag;
    else delete entry.channels;
  }

  if (entry.server || entry.channels) next[host] = entry;
  else delete next[host];

  commit({ ...stored, servers: next });
}

function placementFor(channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): ChannelPlacement | null {
  return channel ? { channelId: channel.id, defaultLevel: channel.defaultNotificationLevel ?? null } : null;
}

/** This channel's own answer, or what it inherits — no global ceiling. */
export function resolveChannelLevel(host: string, channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): NotificationLevel {
  return resolveLevel(stored.servers, host, placementFor(channel));
}

/** What "Default" means for this channel right now, for the long-press menu label. */
export function inheritedChannelLevel(host: string, channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): NotificationLevel {
  return inheritedLevel(stored.servers, host, placementFor(channel));
}

/** The level actually deciding whether anything makes noise: this channel's answer,
    under the global ceiling. */
export function resolveAnnounceLevel(host: string, channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): NotificationLevel {
  return quieterOf(stored.global, resolveChannelLevel(host, channel));
}

/** Whether this conversation is muted outright: no badge, no sound, no unread count.
    Not the global ceiling — see `resolveLevel`. */
export function isChannelMuted(host: string, channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): boolean {
  return resolveChannelLevel(host, channel) === "none";
}

/** Whether a plain message in this channel should make any noise, ceiling included. */
export function announcesMessages(host: string, channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): boolean {
  return shouldAnnounceMessage(resolveAnnounceLevel(host, channel));
}

export function useNotificationPrefs(): StoredNotificationPrefs {
  return useSyncExternalStore(subscribeNotificationPrefs, getStoredNotificationPrefs);
}
