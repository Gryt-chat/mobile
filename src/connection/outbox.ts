import type { SessionIdentity } from "./claims";
import type { Message } from "./types";

/* Drawing a message before the server has agreed to it. Pure and in its own file so the
 * reconciling can be tested: it decides if you see your message once, twice, or never. */

/**
 * A message on screen that may not exist on the server yet. The extra fields are
 * local only: the server's shape is `Message`.
 */
export interface LocalMessage extends Message {
  /** Sent, not yet acknowledged. */
  pending?: boolean;
  /** The send did not land. The text is kept so it can be tried again. */
  failed?: boolean;
  /** What to tell the reader about the failure. */
  failure?: string;
  /** What the server was asked to de-duplicate on. */
  nonce?: string;
  /**
   * How far this message has got through being opened. `opening` is set before the
   * work starts; `locked` is no wrapped key, `broken` is one that does not open.
   */
  sealedState?: "opening" | "open" | "locked" | "broken";
}

/** What the server echoes back to the sender: a message plus the nonce. */
export type IncomingMessage = Message & { nonce?: string };

/** Local ids are prefixed so they cannot collide with the server's uuids. */
export function draftId(nonce: string): string {
  return `pending:${nonce}`;
}

/**
 * The row to show the moment Send is pressed. `sender_server_id` comes off the token's
 * claims, so the draft groups with the messages around it.
 */
export function draftMessage({
  channelId,
  text,
  nonce,
  me,
  attachments = null,
  now = new Date(),
}: {
  channelId: string;
  text: string;
  nonce: string;
  me: SessionIdentity | null;
  /**
   * What is going with it, as local file uris, so the picture is on screen from the
   * moment Send is pressed. `enriched_attachments` arrives with the real message.
   */
  attachments?: string[] | null;
  now?: Date;
}): LocalMessage {
  return {
    conversation_id: channelId,
    message_id: draftId(nonce),
    sender_server_id: me?.serverUserId ?? "",
    sender_nickname: me?.nickname || undefined,
    text,
    created_at: now.toISOString(),
    reactions: null,
    attachments,
    reply_to_message_id: null,
    pending: true,
    nonce,
  };
}

/**
 * Fold an arriving message into the list, replacing the draft it confirms. Three cases:
 * our echo with its nonce; a resend's echo, matched on our own id; and somebody else's.
 */
export function receiveMessage(
  list: LocalMessage[],
  incoming: IncomingMessage,
  me: SessionIdentity | null,
): LocalMessage[] {
  let cleared = list;

  if (incoming.nonce) {
    cleared = list.filter((m) => !(m.pending && m.nonce === incoming.nonce));
  } else if (me && incoming.sender_server_id === me.serverUserId) {
    // The oldest matching draft, since a resend of the first of two identical
    // messages should not clear the second.
    const index = cleared.findIndex(
      (m) => m.pending && m.sender_server_id === me.serverUserId && m.text === incoming.text,
    );
    if (index >= 0) cleared = [...cleared.slice(0, index), ...cleared.slice(index + 1)];
  }

  if (cleared.some((m) => m.message_id === incoming.message_id)) return cleared;

  const { nonce: _nonce, ...message } = incoming;
  return [...cleared, message];
}

/**
 * Mark the newest unacknowledged message as failed. `chat:error` carries no nonce,
 * and every error that happens is about the most recent send. Nothing if none.
 */
export function markLatestFailed(list: LocalMessage[], failure: string): LocalMessage[] {
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].pending) continue;
    const marked = [...list];
    marked[i] = { ...marked[i], pending: false, failed: true, failure };
    return marked;
  }
  return list;
}

/** Mark one particular message failed, when it is known which one. */
export function markFailed(
  list: LocalMessage[],
  nonce: string,
  failure: string,
): LocalMessage[] {
  return list.map((m) =>
    m.nonce === nonce && m.pending ? { ...m, pending: false, failed: true, failure } : m,
  );
}

/** A failed message is on its way again. */
export function markSending(list: LocalMessage[], nonce: string): LocalMessage[] {
  return list.map((m) =>
    m.nonce === nonce ? { ...m, pending: true, failed: false, failure: undefined } : m,
  );
}

/** Take a failed message off the screen. */
export function discardDraft(list: LocalMessage[], nonce: string): LocalMessage[] {
  return list.filter((m) => m.nonce !== nonce);
}

/** Whether anything is still waiting on the server. */
export function hasPending(list: LocalMessage[]): boolean {
  return list.some((m) => m.pending);
}
