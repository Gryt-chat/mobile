import type { LocalMessage } from "../connection/outbox";
import { isSystemMessage } from "./system";

/** A message somebody wrote that has reached the server, which is all a reply can point at. */
export function canReplyTo(message: LocalMessage): boolean {
  if (isSystemMessage(message) || message.pending || message.failed) return false;
  return Boolean(message.message_id) && !message.message_id.startsWith("pending:");
}
