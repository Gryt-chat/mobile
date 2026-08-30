import type { LocalMessage } from "../connection/outbox";

/**
 * What to draw in place of a message that has not been opened (GRYT-729).
 *
 * A sealed message carries no `text` until it is opened, and three of the four
 * states never produce one. Without this they are empty bubbles: a row with a
 * name, a time and nothing between them, which reads as a bug in the app rather
 * than as a message this device cannot read.
 *
 * Pure so it can be checked. The states are cheap to get wrong in a way nothing
 * catches — `broken` and `locked` mean opposite things and would look identical
 * if either were dropped.
 */
export function sealedPlaceholder(message: LocalMessage): string | null {
  if (!message.sealed) return null;

  switch (message.sealedState) {
    case "open":
      // It opened. `text` is the message, and this has nothing to say.
      return null;
    case "locked":
      // No wrapped key for us. Sent before we joined the conversation, which is
      // permanent and ordinary — not a failure, and not worth an alarm.
      return "Sent before you joined this conversation.";
    case "broken":
      // A key that is there and does not open. Tampering, or a message from
      // another conversation. Said plainly without naming a cause, because from
      // here the two are the same thing.
      return "This message could not be opened.";
    default:
      // `opening`, and the moment before it is set.
      return "Decrypting…";
  }
}
