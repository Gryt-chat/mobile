import type { HistoryRecord, SealedAttachmentKey } from "@gryt/crypto";

import type { ArchivedMessage } from "../archive/messageArchive";

/* The bytes history carries between devices (GRYT-1484). The desktop's twin is
   client src/lib/pairing/historyRecords.ts, and the two have to agree field for field. */

type Reaction = NonNullable<ArchivedMessage["reactions"]>[number];

/** The archive's four ids on the outside, the rest as `message`. Unset optional fields stay off. */
export function toHistoryRecord(m: ArchivedMessage): HistoryRecord {
  const message: Record<string, unknown> = { senderId: m.senderId, text: m.text, attachments: m.attachments };
  if (m.senderDeviceId !== undefined) message.senderDeviceId = m.senderDeviceId;
  if (m.editedAt !== undefined) message.editedAt = m.editedAt;
  if (m.replyTo !== undefined) message.replyTo = m.replyTo;
  if (m.reactions?.length) message.reactions = m.reactions;
  return { scope: m.scope, conversationId: m.conversationId, messageId: m.messageId, sentAt: m.sentAt, message };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

function isReaction(v: unknown): v is Reaction {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.src === "string" &&
    typeof v.amount === "number" &&
    Number.isFinite(v.amount) &&
    Array.isArray(v.users) &&
    v.users.every((u) => typeof u === "string")
  );
}

/** A sealed attachment key needs its id, key and nonce; the rest is display, kept as sent. */
function isAttachmentKey(v: unknown): v is SealedAttachmentKey {
  return isPlainObject(v) && typeof v.id === "string" && typeof v.key === "string" && typeof v.iv === "string";
}

/**
 * The archive record, or null when the body isn't one. A bad optional field is dropped, not
 * the record. The other device is yours, but its bytes still get checked before they're kept.
 */
export function fromHistoryRecord(r: HistoryRecord): ArchivedMessage | null {
  const body = r.message;
  if (!isPlainObject(body)) return null;
  if (typeof body.senderId !== "string" || typeof body.text !== "string" || !isPlainObject(body.attachments)) return null;
  if (typeof r.scope !== "string" || typeof r.conversationId !== "string" || typeof r.messageId !== "string") return null;
  if (typeof r.sentAt !== "number" || !Number.isFinite(r.sentAt)) return null;

  const attachments: Record<string, SealedAttachmentKey> = {};
  for (const [id, key] of Object.entries(body.attachments)) {
    if (id !== "__proto__" && isAttachmentKey(key)) attachments[id] = key;
  }

  const out: ArchivedMessage = {
    scope: r.scope,
    conversationId: r.conversationId,
    messageId: r.messageId,
    sentAt: r.sentAt,
    senderId: body.senderId,
    text: body.text,
    attachments,
  };
  if (typeof body.senderDeviceId === "string") out.senderDeviceId = body.senderDeviceId;
  if (typeof body.editedAt === "number" && Number.isFinite(body.editedAt)) out.editedAt = body.editedAt;
  if (typeof body.replyTo === "string") out.replyTo = body.replyTo;
  if (Array.isArray(body.reactions)) {
    const reactions = body.reactions.filter(isReaction).map((x) => ({ src: x.src, amount: x.amount, users: [...x.users] }));
    if (reactions.length) out.reactions = reactions;
  }
  return out;
}
