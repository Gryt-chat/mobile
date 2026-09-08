/**
 * Whether the conversation on screen has stopped existing for this person. A channel
 * denied `read_messages` is not locked; the server stops sending it, as for a deleted one.
 */
export function conversationIsGone(params: {
  /** The connection's status. Only "ready" carries a trustworthy channel list. */
  status: string;
  conversationId: string | null | undefined;
  channelIds: readonly string[];
  directConversationIds: readonly string[];
}): boolean {
  const { status, conversationId, channelIds, directConversationIds } = params;

  // Not ready means the list is empty because nothing has arrived yet. Leaving on that
  // would bounce somebody out of a channel every time the socket reconnected.
  if (status !== "ready") return false;

  if (!conversationId) return false;

  // A direct message is not in `channels` and never was. Treating its absence
  // there as gone would close every DM the moment it opened.
  if (directConversationIds.includes(conversationId)) return false;

  return !channelIds.includes(conversationId);
}
