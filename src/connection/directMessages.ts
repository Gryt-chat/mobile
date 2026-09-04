/* The title, and the two types it needs, moved to `@gryt/core` (GRYT-898).
   The desktop had the same pair and had drifted: it was missing the empty-group
   case and drew a blank row for it. Re-exported so nothing importing from here
   has to move. */
import { type DirectConversation } from "@gryt/core";

export { conversationTitle, type DirectConversation } from "@gryt/core";

/* Derived rather than imported: core has the type but does not name it in its
   barrel, and deriving it is exact rather than a second declaration that could
   drift. Swap this for a named import when core exports one. */
export type ConversationParticipant = DirectConversation["members"][number];

/**
 * The list arithmetic behind `DirectMessagesProvider`, kept out of it.
 *
 * Pure, so it can be checked without a socket or a renderer — the same reason
 * `presence.ts` and `messageGroups.ts` are separate from the screens that use
 * them.
 */

/** Whether an id belongs to a direct message rather than a channel. */
export function isDirectConversationId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("dm_");
}

/**
 * Put a conversation at the top, whether or not it was already there.
 *
 * `dm:opened` arrives both when a conversation is made and when one that
 * already exists is asked for again, and the second case is the one that
 * matters here: appending would list the same conversation twice, and ignoring
 * it would leave a conversation somebody just opened sitting wherever it was.
 *
 * Replaces rather than merges, because the payload is the server's whole view
 * of it — a nickname or an avatar changed since the list was fetched should
 * win, not be kept out by the copy already held.
 */
export function promoteConversation(
  conversations: readonly DirectConversation[],
  conversation: DirectConversation,
): DirectConversation[] {
  return [
    conversation,
    ...conversations.filter((c) => c.conversation_id !== conversation.conversation_id),
  ];
}
