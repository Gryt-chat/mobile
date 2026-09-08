import type { Message } from "../connection/types";

/**
 * The sender id the server uses for its own announcements — the same string on the
 * client and in the server's `systemMessages.ts`. Three copies of one constant.
 */
export const SYSTEM_SENDER_ID = "system";

/** Was this the server talking, rather than a person? */
export function isSystemMessage(message: Message): boolean {
  return message.sender_server_id === SYSTEM_SENDER_ID;
}

/**
 * `[@Sivert](mention:user_abc)` → `@Sivert`. Not a markdown renderer: this is the one
 * construct the server puts in its own announcements, and the first thing anybody sees
 * in a new channel. Deliberately not linkified — there is nothing to open yet.
 */
export function resolveMentions(text: string): string {
  return text.replace(/\[([^\]]+)\]\(mention:[^)]*\)/g, "$1");
}
