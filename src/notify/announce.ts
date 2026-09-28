import type { Channel } from "../connection/types";
import { announcesMessages as resolvedAnnouncesMessages, isChannelMuted as resolvedIsChannelMuted } from "./notificationPrefs";

/**
 * Whether a plain message in this channel should sound and toast: this person's own
 * server and channel levels (GRYT-1534), under the global ceiling.
 */
export function announcesMessages(host: string, channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): boolean {
  return resolvedAnnouncesMessages(host, channel);
}

/**
 * Whether this channel is silent outright: no badge, no unread pill, no mention.
 * Only "none" is muted; "mentions" still badges a plain message (GRYT-1465).
 */
export function isChannelMuted(host: string, channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined): boolean {
  return resolvedIsChannelMuted(host, channel);
}
