import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ChatHistory, Message } from "./types";

/** What the server defaults to, stated here so the cursor maths matches it. */
const PAGE = 50;

export interface MessagesState {
  messages: Message[];
  loading: boolean;
  /** More history exists further back. */
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  /** Ask for the page before the oldest message held. */
  loadOlder: () => void;
}

/**
 * A channel's messages: the first page, the pages before it, and whatever
 * arrives while you are looking.
 *
 * Pagination is a cursor on time, not an offset — `before` is the ISO timestamp
 * of the oldest message held, and the server answers with the page immediately
 * older. An offset would skip or repeat messages whenever one is posted while
 * you are scrolling, which on a chat screen is most of the time.
 *
 * `hasMore` is `items.length >= limit` on the server, so it lies exactly once:
 * a channel whose history is a multiple of the page size reports more, and the
 * next request comes back empty. That is handled by treating an empty page as
 * the end rather than by trusting the flag.
 */
export function useMessages(socket: Socket | null, channelId: string | null): MessagesState {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside the callback rather than depended on, so asking for an older
  // page does not rebuild the listeners and lose the ones already attached.
  const oldest = useRef<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (!socket || !channelId) {
      setMessages([]);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    oldest.current = null;
    pending.current = false;
    setMessages([]);
    setError(null);
    setLoading(true);

    const onHistory = (history: ChatHistory) => {
      // Every channel's history arrives on the same event, so a page for the
      // channel you just left would otherwise land in the one you are in.
      if (cancelled || history.conversation_id !== channelId) return;

      const items = history.items ?? [];
      // Oldest first from the server, which is the order they are rendered in.
      const older = history.before !== undefined;

      setMessages((current) => (older ? [...items, ...current] : items));
      // An empty page means the end regardless of what `hasMore` claims.
      setHasMore(items.length > 0 && history.hasMore);
      if (items.length > 0) oldest.current = items[0].created_at;

      setLoading(false);
      setLoadingMore(false);
      pending.current = false;
    };

    const onNew = (message: Message) => {
      if (cancelled || message.conversation_id !== channelId) return;
      setMessages((current) =>
        // The server echoes a send back to the sender too, so the same id can
        // arrive twice.
        current.some((m) => m.message_id === message.message_id)
          ? current
          : [...current, message],
      );
    };

    const onEdited = (message: Message) => {
      if (cancelled || message.conversation_id !== channelId) return;
      setMessages((current) =>
        current.map((m) => (m.message_id === message.message_id ? message : m)),
      );
    };

    const onDeleted = ({
      conversation_id,
      message_id,
    }: {
      conversation_id: string;
      message_id: string;
    }) => {
      if (cancelled || conversation_id !== channelId) return;
      setMessages((current) => current.filter((m) => m.message_id !== message_id));
    };

    const onError = (payload: string | { message?: string; error?: string }) => {
      if (cancelled) return;
      setError(
        typeof payload === "string"
          ? payload
          : payload?.message || payload?.error || "The server refused the request.",
      );
      setLoading(false);
      setLoadingMore(false);
      pending.current = false;
    };

    socket.on("chat:history", onHistory);
    socket.on("chat:new", onNew);
    socket.on("chat:edited", onEdited);
    // A reaction re-broadcasts the whole message, so it is an edit here.
    socket.on("chat:reaction", onEdited);
    socket.on("chat:deleted", onDeleted);
    socket.on("chat:error", onError);

    socket.emit("chat:fetch", { conversationId: channelId, limit: PAGE });

    return () => {
      cancelled = true;
      socket.off("chat:history", onHistory);
      socket.off("chat:new", onNew);
      socket.off("chat:edited", onEdited);
      socket.off("chat:reaction", onEdited);
      socket.off("chat:deleted", onDeleted);
      socket.off("chat:error", onError);
    };
  }, [socket, channelId]);

  const loadOlder = useCallback(() => {
    // One page in flight at a time. A list near its top fires this on every
    // frame otherwise, and the server rate-limits `chat:fetch`.
    if (!socket || !channelId || pending.current || !hasMore || !oldest.current) return;
    pending.current = true;
    setLoadingMore(true);
    socket.emit("chat:fetch", {
      conversationId: channelId,
      limit: PAGE,
      before: oldest.current,
    });
  }, [socket, channelId, hasMore]);

  return { messages, loading, hasMore, loadingMore, error, loadOlder };
}
