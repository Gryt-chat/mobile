import type { Channel } from "../connection/types";

/**
 * Whether a plain message in this channel should sound and toast. This app has no
 * per-person levels yet, so the level the server set for the channel is the rule.
 */
export function announcesMessages(channel: Pick<Channel, "defaultNotificationLevel"> | undefined): boolean {
  const level = channel?.defaultNotificationLevel;
  // No level is an older server; a word this build does not know reads the same way.
  return level !== "mentions" && level !== "none";
}

/**
 * Whether this channel is silent outright: no badge, no unread pill, no mention.
 * Only "none" is muted; "mentions" still badges a plain message (GRYT-1465).
 */
export function isChannelMuted(channel: Pick<Channel, "defaultNotificationLevel"> | undefined): boolean {
  return channel?.defaultNotificationLevel === "none";
}
