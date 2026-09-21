import type { DirectConversation } from "../connection/directMessages";
import type { Member } from "../connection/types";

/**
 * Who the new-message dialog offers on this server, and which group a create made.
 * Pure, so vitest can run it without a renderer (GRYT-1342).
 */

/** Everybody you could message: not you, and not a bot, which the server refuses. */
export function pickable(members: readonly Member[], me: string | null | undefined): Member[] {
  // Without your own id any row could be you, so nobody rather than you to yourself.
  if (!me) return [];
  return members
    .filter((m) => m.serverUserId !== me && !m.isBot)
    .sort((a, b) => a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" }));
}

export function matching(members: readonly Member[], query: string): Member[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...members];
  return members.filter((m) => m.nickname.toLowerCase().includes(needle));
}

/**
 * The group a create made. The server answers with `dm:opened` and no request id, so
 * it's the one that wasn't there before, with exactly the people picked.
 */
export function createdGroup(
  conversations: readonly DirectConversation[],
  before: ReadonlySet<string>,
  picked: readonly string[],
): DirectConversation | undefined {
  const wanted = [...new Set(picked)].sort().join(",");
  return conversations.find((c) => {
    if (c.kind !== "group" || before.has(c.conversation_id)) return false;
    return c.members.map((m) => m.server_user_id).sort().join(",") === wanted;
  });
}
