/* The title, and the two types it needs, moved to `@gryt/core`. The desktop's copy was
   missing the empty-group case. Re-exported so nothing importing from here moves. */
import { type DirectConversation } from "@gryt/core";

export { conversationTitle, type DirectConversation } from "@gryt/core";

/* Derived rather than imported: core has the type but does not name it in its barrel,
   and deriving it is exact. Swap this for a named import when core exports one. */
export type ConversationParticipant = DirectConversation["members"][number];

/**
 * The list arithmetic behind `DirectMessagesProvider`, kept out of it. Pure, so it can
 * be checked without a socket or a renderer.
 */

/** Whether an id belongs to a direct message rather than a channel. */
export function isDirectConversationId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("dm_");
}

/**
 * Put a conversation at the top, whether or not it was already there — `dm:opened`
 * arrives for an existing one too. Replaces rather than merges.
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
