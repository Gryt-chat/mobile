import type { LocalMessage } from "../connection/outbox";
import type { Message } from "../connection/types";
import { blocksText, parseMarkdown } from "./markdown";

/**
 * What you can do to a message, and what its reactions add up to. Pure and in
 * its own file, because the sheet that draws it reaches React and a socket —
 * every rule here has an edge that would otherwise be found in production.
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
  /**
   * Somebody else's, and only what the server has. Not on your own message,
   * which the server refuses anyway, and not on a system announcement, which
   * has no author for a report to be about.
   */
  canReport: boolean;
}

/**
 * What is offered for one message.
 *
 * **Nothing on a message the server has not acknowledged.** A draft has no
 * `message_id` to name, so every action is a request the server cannot match —
 * the honest answer is a sheet with only Copy on it.
 *
 * System announcements are nobody's, so editing, deleting and reporting are not
 * offered even to the owner. Reacting is allowed, because people do it.
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
    canReport: acknowledged && !mine && !isSystem,
  };
}

export interface ReactionSummary {
  src: string;
  count: number;
  /** Whether you are one of the people in it, so the chip can say so. */
  mine: boolean;
}

/**
 * The reactions on a message, in a shape a row can draw. **The server sends
 * `null` when there are none, not an empty array**, which is what turns a
 * `.map` into a crash.
 *
 * **`amount` is trusted over `users.length`**: the moderation purge deletes a
 * user's reactions without re-broadcasting, so a stale `users` outlives the
 * count. Anything adding to nothing is dropped rather than drawn as zero.
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
 * The one line of a message shown when something quotes it. **Collapsed here
 * rather than by `numberOfLines`**, which draws a newline as a space on one
 * platform and pushes the row open on the other.
 *
 * A message with no text is described rather than shown blank — a stub with
 * nothing in it reads as a loading state.
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
