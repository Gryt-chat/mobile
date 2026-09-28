import type { DmSealingMode } from "@gryt/core";

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
    mls: true,
  };
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
