import type { DmSealingMode, MlsDmContent } from "@gryt/core";
import type { SealedAttachmentKey } from "@gryt/crypto";

import type { ArchivedMessage } from "../archive/messageArchive";
import type { LocalMessage } from "../connection/outbox";
import type { Message } from "../connection/types";
import type { ConversationProblems } from "./session";

/* A DM on MLS reads from two places: the server's history for old messages, and this
   phone's archive for MLS ones. Pure, so the merge has tests. */

/** The server's stand-in for an MLS message, for apps that can't read it (GRYT-1517). */
export function isMlsPlaceholder(message: Message): boolean {
  return !!message.mls_placeholder;
}

export function archivedRow(m: ArchivedMessage, nameFor: (id: string) => string | undefined): LocalMessage {
  return {
    conversation_id: m.conversationId,
    message_id: m.messageId,
    sender_server_id: m.senderId,
    sender_nickname: nameFor(m.senderId),
    text: m.text,
    created_at: new Date(m.sentAt).toISOString(),
    edited_at: m.editedAt === undefined ? null : new Date(m.editedAt).toISOString(),
    reply_to_message_id: m.replyTo ?? null,
    attachments: Object.keys(m.attachments).length ? Object.keys(m.attachments) : null,
    mls: true,
  };
}

type Attachment = NonNullable<LocalMessage["enriched_attachments"]>[number];

/** The row with its files as far as they've opened. One that won't open shows as its id. */
export function withOpenedFiles(row: LocalMessage, opened: ReadonlyMap<string, Attachment | "failed">): LocalMessage {
  if (!row.attachments?.length || row.pending || row.failed) return row;
  const shown = row.attachments.flatMap((id) => {
    const o = opened.get(id);
    return o === undefined ? [] : [o === "failed" ? { file_id: id } : o];
  });
  return shown.length ? { ...row, enriched_attachments: shown } : row;
}

/**
 * A new message, or null when a file has no key: sent anyway, it would reach them as
 * something they can't open.
 */
export function newMessage(
  id: string,
  text: string,
  replyTo: string | null | undefined,
  files: { ids: string[]; keys?: Record<string, SealedAttachmentKey> | null } | null | undefined,
): Extract<MlsDmContent, { type: "message" }> | null {
  const content: Extract<MlsDmContent, { type: "message" }> = { type: "message", id, text };
  if (replyTo) content.replyTo = replyTo;
  if (files?.ids.length) {
    const attachments: Record<string, SealedAttachmentKey> = {};
    for (const fileId of files.ids) {
      const key = files.keys?.[fileId];
      if (!key) return null;
      attachments[fileId] = key;
    }
    content.attachments = attachments;
  }
  return content;
}

const at = (m: Message) => Date.parse(m.created_at) || 0;

/**
 * Both lists by time, placeholders dropped. Each side is paged on its own, so nothing older
 * than the newer of the two oldest loaded rows is shown until the other side catches up.
 */
export function mergeTimeline({
  server,
  serverHasMore,
  archived,
  archiveHasMore,
}: {
  server: LocalMessage[];
  serverHasMore: boolean;
  archived: LocalMessage[];
  archiveHasMore: boolean;
}): LocalMessage[] {
  const shown = server.filter((m) => !isMlsPlaceholder(m));
  const settled = (list: LocalMessage[]) => list.filter((m) => !m.pending && !m.failed);
  const floorOf = (list: LocalMessage[], more: boolean) =>
    more && settled(list).length ? Math.min(...settled(list).map(at)) : -Infinity;
  const floor = Math.max(floorOf(server, serverHasMore), floorOf(archived, archiveHasMore));

  const ids = new Set<string>();
  return [...shown, ...archived]
    .filter((m) => {
      if (ids.has(m.message_id)) return false;
      ids.add(m.message_id);
      return m.pending || m.failed || at(m) >= floor;
    })
    .sort((a, b) => at(a) - at(b));
}

/**
 * Where a send goes: "server" is a channel or version 1, which never needs the archive. Only a
 * DM still waiting on its mode, or refused, holds the composer and shows an archive problem.
 */
export function dmComposer({
  dmPeer,
  mode,
  waiting,
  archiveFailed,
}: {
  dmPeer: string | null;
  mode: DmSealingMode | null;
  waiting: boolean;
  archiveFailed: boolean;
}): { path: "server" | "mls" | "none"; held: boolean; archiveProblem: boolean } {
  if (!dmPeer) return { path: "server", held: false, archiveProblem: false };
  const held = waiting || mode?.kind === "refused";
  const path = mode?.kind === "sealed-v1" ? "server" : mode?.kind === "mls" ? "mls" : "none";
  return { path, held, archiveProblem: archiveFailed && held };
}

/** The line above the composer for a DM on, or held off, MLS. Null says nothing. */
export function mlsNotice(
  mode: DmSealingMode | null,
  problems: ConversationProblems,
  lostHistory: boolean,
  peerName: string,
): string | null {
  if (mode?.kind === "refused") {
    if (mode.reason === "peer_left_mls") return `Can't send. ${peerName}'s app stopped using end-to-end encryption here.`;
    if (mode.reason === "server_dropped_mls") return "Can't send. This server stopped supporting end-to-end encryption.";
    return "Can't send yet. This phone isn't set up for end-to-end encryption here.";
  }
  if (problems.lost === "removed") return "This phone was taken out of this conversation, so new messages won't show here.";
  if (problems.lost) return "This phone lost track of this conversation's encryption, so new messages won't show here.";
  if (problems.undecryptable > 0) {
    const n = problems.undecryptable;
    return `${n} ${n === 1 ? "message" : "messages"} couldn't be decrypted on this phone.`;
  }
  if (lostHistory) return "Older messages were cleared from this phone.";
  return null;
}

/** What a failed MLS send says on its row. */
export function sendFailure(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === "peer_unverified") return "Not sent. Their keys couldn't be checked.";
  if (code === "waiting_for_welcome") return "Not sent. This phone hasn't been added to the conversation yet.";
  return "Not sent.";
}
