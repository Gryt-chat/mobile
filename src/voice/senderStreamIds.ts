/** The phone's video senders. The engine keeps one per role and connection. */
export type SenderRole = "camera" | "screenVideo";

/* Keyed by the connection, so a reconnect, which makes a new one, starts over. */
const byConnection = new WeakMap<object, Partial<Record<SenderRole, string>>>();

/**
 * The stream id to announce for a role: the first one it was given on this connection, which
 * the sender keeps when a later track replaces the first. With no connection, `streamId`.
 */
export function senderStreamId(
  pc: object | null | undefined,
  role: SenderRole,
  streamId: string,
): string {
  if (!pc) return streamId;
  let ids = byConnection.get(pc);
  if (!ids) {
    ids = {};
    byConnection.set(pc, ids);
  }
  const first = ids[role];
  if (first) return first;
  ids[role] = streamId;
  return streamId;
}
