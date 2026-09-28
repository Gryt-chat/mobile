import type { SealedAttachmentKey } from "@gryt/crypto";

import type { ArchiveDb, Statement } from "./archiveDb";
import type { RecordSealer } from "./archiveKey";

/** A message this device decrypted. MLS deletes the key after use, so this copy is the only one. */
export interface ArchivedMessage {
  /** The server, as `identityScopeFor` names it. Conversation ids are only unique per server. */
  scope: string;
  conversationId: string;
  messageId: string;
  /** The server's timestamp in ms. Paging orders by it, then by `messageId`. */
  sentAt: number;
  senderId: string;
  senderDeviceId?: string;
  text: string;
  attachments: Record<string, SealedAttachmentKey>;
  editedAt?: number;
}

type MessageBody = Pick<ArchivedMessage, "senderId" | "senderDeviceId" | "text" | "attachments" | "editedAt">;

export interface ArchiveCursor {
  sentAt: number;
  messageId: string;
}

export interface ArchiveChange {
  scope: string;
  conversationId: string;
}

/** Ids and time stay readable for the index; the server already knows all four. */
interface MessageRow {
  message_id: string;
  sent_at: number;
  iv: Uint8Array;
  ct: Uint8Array;
}

type Ids = Pick<ArchivedMessage, "scope" | "conversationId" | "messageId" | "sentAt">;

function context(m: Ids): string {
  return `message:${JSON.stringify([m.scope, m.conversationId, m.messageId, m.sentAt])}`;
}

/** Same API as the desktop's `MessageArchive`, minus the tabs: the phone has one JS runtime. */
export class MessageArchive {
  private readonly db: ArchiveDb;
  private readonly sealer: RecordSealer;
  private readonly listeners = new Set<(change: ArchiveChange) => void>();

  constructor(db: ArchiveDb, sealer: RecordSealer) {
    this.db = db;
    this.sealer = sealer;
  }

  /** Always true on the phone, which always has a Keychain or Keystore. */
  get sealed(): boolean {
    return true;
  }

  /** Writes in one transaction, replacing any record with the same ids (an edit). */
  async put(messages: ArchivedMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const statements: Statement[] = await Promise.all(
      messages.map(async (m): Promise<Statement> => {
        const body: MessageBody = { senderId: m.senderId, text: m.text, attachments: m.attachments };
        if (m.senderDeviceId !== undefined) body.senderDeviceId = m.senderDeviceId;
        if (m.editedAt !== undefined) body.editedAt = m.editedAt;
        const sealed = await this.sealer.seal(context(m), new TextEncoder().encode(JSON.stringify(body)));
        return [
          "INSERT OR REPLACE INTO messages (scope, conversation_id, message_id, sent_at, iv, ct) VALUES (?, ?, ?, ?, ?, ?)",
          [m.scope, m.conversationId, m.messageId, m.sentAt, sealed.iv, sealed.ct],
        ];
      }),
    );
    await this.db.transaction(statements);

    const seen = new Set<string>();
    for (const m of messages) {
      const id = JSON.stringify([m.scope, m.conversationId]);
      if (seen.has(id)) continue;
      seen.add(id);
      this.emit({ scope: m.scope, conversationId: m.conversationId });
    }
  }

  async get(scope: string, conversationId: string, messageId: string): Promise<ArchivedMessage | null> {
    const row = await this.db.first<MessageRow>(
      "SELECT message_id, sent_at, iv, ct FROM messages WHERE scope = ? AND conversation_id = ? AND message_id = ?",
      [scope, conversationId, messageId],
    );
    return row ? this.fromRow(scope, conversationId, row) : null;
  }

  /**
   * Up to `limit` messages sent before `before`, oldest first. Pass the first one
   * back as `before` to page further up. Records that fail to open are skipped.
   */
  async page(
    scope: string,
    conversationId: string,
    { before, limit = 50 }: { before?: ArchiveCursor; limit?: number } = {},
  ): Promise<ArchivedMessage[]> {
    const rows = before
      ? await this.db.all<MessageRow>(
          `SELECT message_id, sent_at, iv, ct FROM messages
           WHERE scope = ? AND conversation_id = ? AND (sent_at < ? OR (sent_at = ? AND message_id < ?))
           ORDER BY sent_at DESC, message_id DESC LIMIT ?`,
          [scope, conversationId, before.sentAt, before.sentAt, before.messageId, limit],
        )
      : await this.db.all<MessageRow>(
          `SELECT message_id, sent_at, iv, ct FROM messages
           WHERE scope = ? AND conversation_id = ?
           ORDER BY sent_at DESC, message_id DESC LIMIT ?`,
          [scope, conversationId, limit],
        );

    const opened = await Promise.all(rows.reverse().map((row) => this.fromRow(scope, conversationId, row)));
    return opened.filter((m): m is ArchivedMessage => m !== null);
  }

  async remove(scope: string, conversationId: string, messageId: string): Promise<void> {
    await this.db.transaction([
      [
        "DELETE FROM messages WHERE scope = ? AND conversation_id = ? AND message_id = ?",
        [scope, conversationId, messageId],
      ],
    ]);
    this.emit({ scope, conversationId });
  }

  async removeConversation(scope: string, conversationId: string): Promise<void> {
    await this.db.transaction([
      ["DELETE FROM messages WHERE scope = ? AND conversation_id = ?", [scope, conversationId]],
    ]);
    this.emit({ scope, conversationId });
  }

  onChange(listener: (change: ArchiveChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
  }

  private emit(change: ArchiveChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (e) {
        console.warn("[Archive] A change listener threw:", e);
      }
    }
  }

  private async fromRow(scope: string, conversationId: string, row: MessageRow): Promise<ArchivedMessage | null> {
    const ids: Ids = { scope, conversationId, messageId: row.message_id, sentAt: row.sent_at };
    try {
      const bytes = await this.sealer.open(context(ids), { iv: row.iv, ct: row.ct });
      return { ...ids, ...(JSON.parse(new TextDecoder().decode(bytes)) as MessageBody) };
    } catch (e) {
      console.warn("[Archive] Skipped a message that didn't open:", conversationId, row.message_id, e);
      return null;
    }
  }
}
