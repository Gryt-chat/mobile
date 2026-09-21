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
