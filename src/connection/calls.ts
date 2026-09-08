/**
 * The ring arithmetic behind `CallsProvider`, kept out of it. **A call is not state
 * anywhere in Gryt** — this is the moment before somebody answers.
 */

export interface IncomingCall {
  conversation_id: string;
  from: { server_user_id: string; nickname: string };
  /** When the server gives up on its own. */
  expires_at: number;
}

/** Why a ring stopped, as the server tells it. */
export type CallEndReason = "answered" | "declined" | "cancelled" | "timeout";

export interface CallWithdrawn {
  conversation_id?: string;
  reason?: CallEndReason;
  ended_by?: string | null;
}

/** Whether a payload off the socket is a ring worth showing. */
export function isRing(value: unknown): value is IncomingCall {
  if (!value || typeof value !== "object") return false;
  const call = value as Partial<IncomingCall>;
  return (
    typeof call.conversation_id === "string" &&
    call.conversation_id.length > 0 &&
    typeof call.from === "object" &&
    call.from !== null &&
    typeof call.from.server_user_id === "string"
  );
}

/**
 * The ring after a withdrawal. **Only the conversation named is cleared** — two rings
 * can be going at once.
 */
export function afterWithdrawal(
  ring: IncomingCall | null,
  payload: CallWithdrawn,
): IncomingCall | null {
  if (!ring) return null;
  if (!payload?.conversation_id) return ring;
  return payload.conversation_id === ring.conversation_id ? null : ring;
}

/**
 * Whether a ring has outlived the server's clock. The withdrawal is the real end; this
 * stops a ring sitting on screen when the socket died.
 */
export function hasExpired(ring: IncomingCall | null, now: number): boolean {
  return Boolean(ring) && ring!.expires_at <= now;
}

/**
 * What to say out loud when a ring ends — only the endings somebody is waiting on.
 * "Answered" is followed by being in a call, which says itself.
 */
export function endedMessage(payload: CallWithdrawn): string | null {
  if (payload?.reason === "declined") return "Call declined";
  if (payload?.reason === "timeout") return "No answer";
  return null;
}

/** `voice:call:members`, as the server sends it. */
export interface CallMembers {
  conversation_id?: string;
  server_user_ids?: string[];
}

/**
 * Which conversations have a call going, after one message. The server sends it to
 * everybody in the conversation. Returns the same set when nothing changed.
 */
export function afterCallMembers(live: Set<string>, payload: CallMembers): Set<string> {
  const id = payload?.conversation_id;
  if (!id || !Array.isArray(payload.server_user_ids)) return live;

  const nowLive = payload.server_user_ids.length > 0;
  if (nowLive === live.has(id)) return live;

  const next = new Set(live);
  if (nowLive) next.add(id);
  else next.delete(id);
  return next;
}
