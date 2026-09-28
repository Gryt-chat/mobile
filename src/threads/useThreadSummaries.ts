import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ChatHistory, ThreadSummary } from "../connection/types";
import {
  applyUpdate,
  errorText,
  mergeSummaries,
  removeSummary,
  type Summaries,
  type ThreadUpdate,
} from "./threads";

export interface ThreadSummariesState {
  /** Keyed by root message id, so a message row can find its own thread. */
  summaries: Summaries;
  /** Open the thread on this message, starting it first when there is none. */
  start: (rootMessageId: string) => void;
}

/**
 * The threads hanging off one channel's messages, and starting a new one. Only the one
 * who started it is taken into it, when the server's `thread:created` comes back.
 */
export function useThreadSummaries(
  socket: Socket | null,
  channelId: string | null,
  {
    getAccessToken,
    onOpen,
    onRefused,
  }: {
    getAccessToken: () => Promise<string | null>;
    onOpen: (thread: ThreadSummary) => void;
    onRefused: (message: string) => void;
  },
): ThreadSummariesState {
  const [summaries, setSummaries] = useState<Summaries>({});
  const summariesRef = useRef(summaries);
  summariesRef.current = summaries;
  const pendingRoot = useRef<string | null>(null);
  const callbacks = useRef({ onOpen, onRefused, getAccessToken });
  callbacks.current = { onOpen, onRefused, getAccessToken };

  useEffect(() => {
    setSummaries({});
    pendingRoot.current = null;
    if (!socket || !channelId) return;

    const onHistory = (history: ChatHistory) => {
      if (history.conversation_id !== channelId) return;
      setSummaries((prev) => mergeSummaries(prev, history.threads));
    };
    const onCreated = (t: ThreadSummary) => {
      if (t?.conversation_id !== channelId) return;
      setSummaries((prev) => mergeSummaries(prev, [t]));
      if (pendingRoot.current !== t.root_message_id) return;
      pendingRoot.current = null;
      callbacks.current.onOpen(t);
    };
    const onUpdated = (t: ThreadUpdate) => {
      if (t?.conversation_id === channelId) setSummaries((prev) => applyUpdate(prev, t));
    };
    const onDeleted = (t: { conversation_id?: string; root_message_id?: string }) => {
      if (t?.conversation_id !== channelId || !t.root_message_id) return;
      setSummaries((prev) => removeSummary(prev, t.root_message_id!));
    };
    // Only while a start is waiting. The thread screen says its own refusals.
    const onError = (payload: unknown) => {
      if (!pendingRoot.current) return;
      pendingRoot.current = null;
      callbacks.current.onRefused(errorText(payload));
    };

    socket.on("chat:history", onHistory);
    socket.on("thread:created", onCreated);
    socket.on("thread:updated", onUpdated);
    socket.on("thread:deleted", onDeleted);
    socket.on("thread:error", onError);
    return () => {
      socket.off("chat:history", onHistory);
      socket.off("thread:created", onCreated);
      socket.off("thread:updated", onUpdated);
      socket.off("thread:deleted", onDeleted);
      socket.off("thread:error", onError);
    };
  }, [socket, channelId]);

  const start = useCallback(
    (rootMessageId: string) => {
      const existing = summariesRef.current[rootMessageId];
      if (existing) {
        callbacks.current.onOpen(existing);
        return;
      }
      if (!socket || !channelId) return;
      // A dead socket swallows the emit, and nothing would ever come back to open.
      if (!socket.connected) {
        callbacks.current.onRefused("Not connected to this server");
        return;
      }
      pendingRoot.current = rootMessageId;
      void callbacks.current.getAccessToken().then((accessToken) => {
        if (!accessToken) {
          pendingRoot.current = null;
          callbacks.current.onRefused("Not signed in to this server.");
          return;
        }
        socket.emit("thread:create", { conversationId: channelId, rootMessageId, accessToken });
      });
    },
    [socket, channelId],
  );

  return { summaries, start };
}
