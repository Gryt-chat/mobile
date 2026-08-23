import type { SessionIdentity } from "./claims";
import type { Message } from "./types";

/* Drawing a message before the server has agreed to it.
 *
 * Pure, and in its own file, so the reconciling can be tested — it is the part
 * that decides whether you see your message once, twice, or never, and none of
 * that is visible from a component.
 */

/**
 * A message on screen that may not exist on the server yet.
 *
 * The extra fields are local only. They are never sent and never arrive: the
 * server's shape is `Message`, and everything here is about what this device
 * knows that the server does not.
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
}

/** What the server echoes back to the sender: a message plus the nonce. */
export type IncomingMessage = Message & { nonce?: string };

/** Local ids are prefixed so they cannot collide with the server's uuids. */
export function draftId(nonce: string): string {
  return `pending:${nonce}`;
}

/**
 * The row to show the moment Send is pressed.
 *
 * `sender_server_id` comes from the access token's claims rather than being
 * left blank, and that is the point of reading them at all: the real message
 * carries the same id, so the draft groups with the messages around it and is
 * replaced in place instead of appearing to jump.
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
   * What is going with it, as local file uris.
   *
   * The draft draws from the picked file rather than from the server, so the
   * picture is on screen from the moment Send is pressed instead of appearing
   * once the upload finishes. `enriched_attachments` is filled in when the real
   * message arrives; until then these are `file://` paths that mean nothing to
   * anybody else.
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
 * Fold an arriving message into the list, replacing the draft it confirms.
 *
 * Three things can bring a message here and each needs a different answer:
 *
 * - **The echo of our own send**, carrying the nonce we chose. It replaces the
 *   draft with that nonce.
 * - **The echo of a *resend*.** A server that has seen the nonce before replays
 *   the message it stored, and versions before GRYT-422 replay it without
 *   re-attaching the nonce — so the only thing tying it to our draft is that it
 *   is from us and says the same thing. Matching on text alone would let
 *   somebody else's identical message clear our draft, so this is restricted to
 *   our own id.
 * - **Somebody else's message**, or our own arriving twice. Appended, or
 *   ignored if the id is already held.
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
 * Mark the newest unacknowledged message as failed.
 *
 * `chat:error` carries no nonce, so there is nothing to attribute it to. The
 * newest is the best guess available and it is right for the errors that
 * actually happen: every one of them — rate limited, empty, too large, not
 * connected to this voice channel — is about the send that provoked it, and
 * that is the most recent one. The desktop client does the same.
 *
 * Nothing happens if there is no send outstanding, which is the case for an
 * error about an edit or a reaction.
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
