import { type ReencryptCandidate, reencryptMine } from "@gryt/core";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import { openLocalArchive } from "../archive/localArchive";
import type { ArchivedMessage } from "../archive/messageArchive";
import { archivedReactions } from "./applyContent";
import type { MlsSource } from "./session";

const REENCRYPT_ON = false as boolean;
const FETCH_TIMEOUT_MS = 15_000;
const PAGE = 100;

function doneKey(host: string, conversationId: string): string {
  return `gryt.reencrypted.${host}.${conversationId}`.replace(/[^A-Za-z0-9._-]/g, "_");
}

function fetchOlder(socket: Socket, conversationId: string, before: string | undefined): Promise<{ items: ReencryptCandidate[]; hasMore: boolean }> {
  return new Promise((resolve, reject) => {
    const onHistory = (payload: { conversation_id?: string; before?: string; items?: ReencryptCandidate[]; hasMore?: boolean }) => {
      if (payload?.conversation_id !== conversationId || (payload.before ?? undefined) !== before) return;
      clearTimeout(timer);
      socket.off("chat:history", onHistory);
      resolve({ items: payload.items ?? [], hasMore: !!payload.hasMore });
    };
    const timer = setTimeout(() => {
      socket.off("chat:history", onHistory);
      reject(new Error("The server didn’t send the older messages."));
    }, FETCH_TIMEOUT_MS);
    socket.on("chat:history", onHistory);
    socket.emit("chat:fetch", { conversationId, limit: PAGE, ...(before ? { before } : {}) });
  });
}

/** Moves this person's old plaintext onto the DM's key once `ready` says that key works. Leaving the DM pauses it. */
export function useReencrypt({ host, socket, source, me, conversationId, peer, ready, getToken, onDone }: {
  host: string;
  socket: Socket | null;
  source: Pick<MlsSource, "send" | "storeScope"> | null;
  me: string | undefined;
  conversationId: string | null;
  peer: string | null;
  ready: boolean;
  getToken: () => Promise<string | null>;
  onDone: (moved: number) => void;
}): { done: number; total: number } | null {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    // Off until it has proved safe on real DMs: it deletes server copies. GRYT-1969.
    if (!REENCRYPT_ON) return;
    if (!ready || !socket || !source || !me || !conversationId || !peer) return;
    const key = doneKey(host, conversationId);
    let stopped = false;
    void (async () => {
      try {
        if (await SecureStore.getItemAsync(key)) return;
        const token = await getToken();
        if (!token || stopped) return;
        const { messages } = await openLocalArchive();
        const moved = await reencryptMine({
          fetchOlder: (before) => fetchOlder(socket, conversationId, before),
          send: async (content) => { await source.send(conversationId, peer, content); },
          keep: (entries, receivedAt) => messages.put(entries.map((e): ArchivedMessage => ({
            scope: source.storeScope, conversationId, messageId: e.id, sentAt: e.sentAt, senderId: me,
            text: e.text, attachments: {}, sharedBy: me, receivedAt, ...(e.replyTo ? { replyTo: e.replyTo } : {}),
            ...(e.reactions ? { reactions: archivedReactions(e.reactions) } : {}),
          }))),
          remove: (messageId) => socket.emit("chat:delete", { conversationId, messageId, accessToken: token }),
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
          now: () => Date.now(),
          newId: () => Crypto.randomUUID(),
          stopped: () => stopped,
          report: (done, total) => {
            if (!stopped && total) setProgress({ done, total });
          },
        }, me);
        if (stopped) return;
        await SecureStore.setItemAsync(key, "1");
        if (moved) onDone(moved);
      } catch (e) {
        console.warn("[MLS] Encrypting older messages stopped, and tries again next time", e);
      } finally {
        if (!stopped) setProgress(null);
      }
    })();
    return () => {
      stopped = true;
      setProgress(null);
    };
    // getToken and onDone change every render, and neither should restart a running move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, host, socket, source, me, conversationId, peer]);

  return progress;
}
