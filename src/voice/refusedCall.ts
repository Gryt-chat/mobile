/** What to do when joining a room fails. */
export interface JoinFailure {
  /** The room the join was for. */
  id: string;
  /** A conversation's call room, rather than a server channel. */
  isCall: boolean;
  /** The room still being asked for, so a failure from a join already left is ignored. */
  current: string | null;
}

export interface CallSettle {
  cancelRing: (conversationId: string) => void;
  leave: () => void;
  say: (message: string) => void;
}

export const CALL_REFUSED = "The call couldn't start.";

/** A failed call ends once: stop the ring, leave the room and say so. */
export function settleFailedJoin(failure: JoinFailure, settle: CallSettle): boolean {
  if (!failure.isCall || failure.current !== failure.id) return false;
  settle.cancelRing(failure.id);
  settle.leave();
  settle.say(CALL_REFUSED);
  return true;
}

/** A ring the server confirms after its call was refused, since the ring and the join race. */
export function staleRing(refused: string | null, ringing: string | null): boolean {
  return refused !== null && refused === ringing;
}
