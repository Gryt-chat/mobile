import type { LocalMessage } from "../connection/outbox";

/**
 * What to draw in place of a message that has not been opened — three of the four states
 * never produce `text`. Pure: `broken` and `locked` mean opposite things (GRYT-729).
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
      // A key that is there and does not open: tampering, or a message from another
      // conversation. Said without naming a cause — from here the two are the same.
      return "This message could not be opened.";
    default:
      // `opening`, and the moment before it is set.
      return "Decrypting…";
  }
}
