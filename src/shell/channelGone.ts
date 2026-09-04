/**
 * Whether the conversation on screen has stopped existing for this person.
 *
 * A channel can be denied `read_messages` by its permission scope while
 * somebody is reading it. The server does not mark it locked — it stops sending
 * it, so it drops out of `state.channels` mid-session, exactly as a deleted one
 * does. Both cases want the same answer.
 *
 * Left alone, the screen stays open with the raw conversation id as its title
 * and every history request from then on is refused.
 *
 * Pure and on its own so it can be tested. Anything importing the screen pulls
 * in react-native, whose Flow syntax vitest cannot parse.
 */
export function conversationIsGone(params: {
  /** The connection's status. Only "ready" carries a trustworthy channel list. */
  status: string;
  conversationId: string | null | undefined;
  channelIds: readonly string[];
  directConversationIds: readonly string[];
}): boolean {
  const { status, conversationId, channelIds, directConversationIds } = params;

  // Not ready means the list is empty because nothing has arrived yet, not
  // because the channel went away. Leaving on that would bounce somebody out
  // of a channel every time the socket reconnected.
  if (status !== "ready") return false;

  if (!conversationId) return false;

  // A direct message is not in `channels` and never was. Treating its absence
  // there as gone would close every DM the moment it opened.
  if (directConversationIds.includes(conversationId)) return false;

  return !channelIds.includes(conversationId);
}
