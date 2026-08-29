/**
 * The list arithmetic behind `DirectMessagesProvider`, kept out of it.
 *
 * Pure, so it can be checked without a socket or a renderer — the same reason
 * `presence.ts` and `messageGroups.ts` are separate from the screens that use
 * them.
 */

export interface DirectConversation {
  conversation_id: string;
  created_at: string;
  last_message_at: string | null;
  other: {
    server_user_id: string;
    nickname: string;
    avatar_file_id: string | null;
    /** The owl look, so a DM row draws the same face the member list does. */
    avatar_worn: string | null;
  };
}

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
