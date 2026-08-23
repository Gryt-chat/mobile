import type { LocalMessage } from "../connection/outbox";
import type { Message } from "../connection/types";
import { blocksText, parseMarkdown } from "./markdown";

/**
 * What you can do to a message, and what its reactions add up to.
 *
 * Pure and in its own file for the reason `messageGroups.ts` is: the sheet that
 * draws this reaches React and a socket, so a rule left inside it is a rule
 * that cannot have a test. The rules here are small and every one of them has
 * an edge that would otherwise be found in production — a message that has not
 * been acknowledged yet, a reaction list the server sent as null, a system
 * announcement nobody should be able to delete.
 */

/**
 * The six offered above the actions.
 *
 * Six because that is what fits on one row at 46pt without crowding on the
 * narrowest screen the app runs on. They are the desktop's own defaults, so a
 * reaction left from a phone is one people recognise from the other client.
 */
export const QUICK_REACTIONS = ["\u{1F44D}", "\u{1F389}", "✅", "\u{1F440}", "❤️", "\u{1F602}"];

export interface MessageAbilities {
  /** Anything with text can be quoted back. */
  canReply: boolean;
  canReact: boolean;
  /** Your own words, and only while they exist on the server. */
  canEdit: boolean;
  canDelete: boolean;
  canCopy: boolean;
}

/**
 * What is offered for one message.
 *
 * **Nothing is offered on a message the server has not acknowledged.** A draft
 * has no `message_id` to name in `chat:react` or `chat:edit`, so every action
 * would be a request the server cannot match. It is a real state — the row is
 * on screen and greyed — and the honest answer is a sheet with only Copy on it
 * rather than four buttons that fail.
 *
 * System announcements are nobody's: they have no author to be, so editing and
 * deleting are not offered even to the owner. Reacting to one is allowed,
 * because it is harmless and people do it.
 */
export function abilitiesFor(
  message: LocalMessage,
  me: string | null,
  isSystem: boolean,
): MessageAbilities {
  const acknowledged = !message.pending && !message.failed && !message.message_id.startsWith("pending:");
  const mine = me !== null && message.sender_server_id === me;
  const hasText = Boolean(message.text && message.text.trim());

  return {
    canReply: acknowledged && !isSystem,
    canReact: acknowledged,
    canEdit: acknowledged && mine && !isSystem && hasText,
    canDelete: acknowledged && mine && !isSystem,
    canCopy: hasText,
  };
}

export interface ReactionSummary {
  src: string;
  count: number;
  /** Whether you are one of the people in it, so the chip can say so. */
  mine: boolean;
}

/**
 * The reactions on a message, in a shape a row can draw.
 *
 * The server sends `{ src, amount, users }` and `null` when there are none —
 * not an empty array — which is the case that turns a `.map` into a crash.
 *
 * `amount` is trusted over `users.length` because the two can disagree: the
 * moderation purge deletes a user's reactions without re-broadcasting each
 * message, so a stale `users` array outlives the count. Anything that adds up
 * to nothing is dropped rather than drawn as a chip reading zero.
 */
export function summariseReactions(
  reactions: Message["reactions"],
  me: string | null,
): ReactionSummary[] {
  if (!Array.isArray(reactions)) return [];

  return reactions
    .filter((r) => r && typeof r.src === "string" && r.amount > 0)
    .map((r) => ({
      src: r.src,
      count: r.amount,
      mine: me !== null && Array.isArray(r.users) && r.users.includes(me),
    }));
}

/**
 * The one line of a message shown when something quotes it.
 *
 * Collapsed to a single line first: a reply stub is one line tall and a
 * newline inside it would either be drawn as a space by `numberOfLines` or
 * push the row open, depending on the platform. Doing it here means both
 * behave the same.
 *
 * A message with no text is described rather than shown blank — "a picture"
 * is what you would say out loud, and a stub with nothing in it reads as a
 * loading state.
 */
export function quoteOf(message: Message | undefined): string {
  if (!message) return "a message";

  /* The words rather than the source. A one-line stub is the worst place for
   * raw markdown: it has no room to make sense of `**` and a fenced block
   * collapses to a row of backticks. */
  const text = message.text
    ? blocksText(parseMarkdown(message.text)).replace(/\s+/g, " ").trim()
    : undefined;
  if (text) return text;

  const count = message.enriched_attachments?.length ?? message.attachments?.length ?? 0;
  if (count > 1) return `${count} attachments`;
  if (count === 1) return "an attachment";
  return "a message";
}
