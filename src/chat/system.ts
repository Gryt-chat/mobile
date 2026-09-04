import type { Message } from "../connection/types";

/**
 * The sender id the server uses for its own announcements.
 *
 * `SYSTEM_SENDER_ID` on the client too, and the same string on the server in
 * `systemMessages.ts`. Three copies of one constant; the alternative is a shared
 * package none of them has.
 */
export const SYSTEM_SENDER_ID = "system";

/** Was this the server talking, rather than a person? */
export function isSystemMessage(message: Message): boolean {
  return message.sender_server_id === SYSTEM_SENDER_ID;
}

/**
 * `[@Sivert](mention:user_abc)` → `@Sivert`.
 *
 * Not a markdown renderer — that is its own job and its own task. This is the
 * one construct the server puts in its own announcements, and without it a join
 * reads as
 *
 *     [@You](mention:user_224d63d2-ec1c-4547-b5e7-752a6c0ef402) joined the server
 *
 * which is the first thing anybody sees in a new channel.
 *
 * The `@` is kept because the label already carries it inside the brackets, so
 * dropping the brackets is the whole job.
 *
 * Deliberately not linkified. Tapping a mention should open that person, and
 * there is nothing to open yet — a tappable name that does nothing is worse
 * than a plain one.
 */
export function resolveMentions(text: string): string {
  return text.replace(/\[([^\]]+)\]\(mention:[^)]*\)/g, "$1");
}
