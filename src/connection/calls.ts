/**
 * The ring arithmetic behind `CallsProvider`, kept out of it.
 *
 * A call is not state anywhere in Gryt. It is an SFU room whose id is the
 * conversation id, joined through the same path a voice channel is, and the
 * server ends the ring when the join lands. So there is nothing here about a
 * call in progress — being in one is being in a voice room, and the voice state
 * already says so.
 *
 * What is here is the moment before that: somebody is ringing and nobody has
 * answered yet. Pure, because the rules are small and the failures are the kind
 * a test catches — a ring left on screen after it stopped, or one cleared
 * because a *different* conversation's ring ended.
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
 * The ring after a withdrawal, which is usually null and sometimes unchanged.
 *
 * Only the conversation named is cleared. Two rings can be going at once — one
 * you started and one somebody started at you — and clearing on any withdrawal
 * would take down the wrong one. That is the bug this function exists to make
 * impossible to write by accident.
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
 * Whether a ring has outlived the server's clock.
 *
 * The server's withdrawal is the real end and this is not a substitute for it.
 * It is what stops a ring sitting on screen for ever when the socket died
 * between the ring and the timeout — answering that would join an empty room.
 */
export function hasExpired(ring: IncomingCall | null, now: number): boolean {
  return Boolean(ring) && ring!.expires_at <= now;
}

/**
 * What to say out loud when a ring ends.
 *
 * Only the endings somebody is waiting on. "Answered" is followed by being in a
 * call, which says itself, and a ring the caller cancelled was cancelled by
 * them — telling them what they just did is noise.
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
 * Which conversations have a call going on in them, after one message.
 *
 * The server sends this to everybody in the conversation, not only to the
 * people in the call, which is what lets a row say something is happening
 * before you have joined it. An empty list is how a call ends — nobody is left
 * in the room to say so, so the server says it on their behalf.
 *
 * Returns the same set when nothing changed, so a provider can hold it in state
 * without repainting the sidebar on every mute.
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
