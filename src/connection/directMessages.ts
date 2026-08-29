/**
 * The list arithmetic behind `DirectMessagesProvider`, kept out of it.
 *
 * Pure, so it can be checked without a socket or a renderer — the same reason
 * `presence.ts` and `messageGroups.ts` are separate from the screens that use
 * them.
 */

export interface ConversationParticipant {
  server_user_id: string;
  nickname: string;
  avatar_file_id: string | null;
  /** The owl look, so a row draws the same face the member list does. */
  avatar_worn: string | null;
}

export interface DirectConversation {
  conversation_id: string;
  /** Two people, or more than two. Groups get their own section. */
  kind: "dm" | "group";
  /** What a group was named. Null means read it off `members`. */
  name: string | null;
  /** An upload. Null means draw one from the name. */
  icon_file_id: string | null;
  created_at: string;
  last_message_at: string | null;
  /** Everybody but you. */
  members: ConversationParticipant[];
  /** The first of `members`. The whole story on a one-to-one. */
  other: ConversationParticipant;
}

/**
 * What to call a conversation on screen.
 *
 * A one-to-one is the other person. A named group is its name. An unnamed
 * group is who is in it — built here rather than stored, so it follows a
 * rename instead of going stale.
 *
 * The same rule the desktop client uses. Two clients disagreeing about what a
 * group is called is worse than either answer.
 */
export function conversationTitle(conversation: DirectConversation): string {
  if (conversation.kind === "dm") return conversation.other.nickname;
  if (conversation.name) return conversation.name;
  const names = conversation.members.map((m) => m.nickname);
  if (names.length === 0) return "Group";
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
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
