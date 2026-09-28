import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ThreadSummary } from "../connection/types";
import { errorText, topicFromWire, type ForumTopic } from "./threads";

export interface ForumTopicsState {
  topics: ForumTopic[];
  loading: boolean;
  /** A create is on its way. The form stays open, and says why if it is refused. */
  creating: boolean;
  createError: string | null;
  clearCreateError: () => void;
  create: (title: string, text: string, tagIds: string[]) => void;
}

/**
 * A forum's topics, asked for again whenever a thread in it changes, the way the
 * desktop's useForum does. `onCreated` hands the new topic over to be opened.
 */
export function useForumTopics(
  socket: Socket | null,
  channelId: string | null,
  getAccessToken: () => Promise<string | null>,
  onCreated: (topic: ThreadSummary) => void,
): ForumTopicsState {
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const callbacks = useRef({ onCreated, getAccessToken });
  callbacks.current = { onCreated, getAccessToken };

  useEffect(() => {
    setTopics([]);
    if (!socket || !channelId) return;
    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const refetch = () => socket.emit("forum:topics", { conversationId: channelId });
    const soon = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refetch, 250);
    };

    const onList = (p: { conversation_id?: string; topics?: Parameters<typeof topicFromWire>[0][] }) => {
      if (!alive || p?.conversation_id !== channelId) return;
      setTopics((p.topics ?? []).map(topicFromWire));
      setLoading(false);
    };
    const onThreadEvent = (p: { conversation_id?: string }) => {
      if (p?.conversation_id === channelId) soon();
    };
    const onTopicCreated = (p: ThreadSummary) => {
      if (p?.conversation_id !== channelId || !creatingRef.current) return;
      creatingRef.current = false;
      setCreating(false);
      setCreateError(null);
      soon();
      callbacks.current.onCreated(p);
    };
    const onError = (payload: unknown) => {
      if (!creatingRef.current) {
        setLoading(false);
        return;
      }
      creatingRef.current = false;
      setCreating(false);
      setCreateError(errorText(payload));
    };

    socket.on("forum:topics:list", onList);
    socket.on("forum:topic:created", onTopicCreated);
    socket.on("thread:created", onThreadEvent);
    socket.on("thread:updated", onThreadEvent);
    socket.on("thread:deleted", onThreadEvent);
    socket.on("forum:error", onError);
    socket.on("connect", refetch);
    setLoading(true);
    refetch();

    return () => {
      alive = false;
      if (debounce) clearTimeout(debounce);
      socket.off("forum:topics:list", onList);
      socket.off("forum:topic:created", onTopicCreated);
      socket.off("thread:created", onThreadEvent);
      socket.off("thread:updated", onThreadEvent);
      socket.off("thread:deleted", onThreadEvent);
      socket.off("forum:error", onError);
      socket.off("connect", refetch);
    };
  }, [socket, channelId]);

  const create = useCallback(
    (title: string, text: string, tagIds: string[]) => {
      if (!socket || !channelId || creatingRef.current) return;
      if (!socket.connected) {
        setCreateError("Not connected to this server.");
        return;
      }
      creatingRef.current = true;
      setCreating(true);
      setCreateError(null);
      void callbacks.current.getAccessToken().then((accessToken) => {
        if (!accessToken) {
          creatingRef.current = false;
          setCreating(false);
          setCreateError("Not signed in to this server.");
          return;
        }
        socket.emit("forum:topic:create", {
          conversationId: channelId,
          title: title.trim(),
          text: text.trim(),
          tagIds,
          accessToken,
        });
      });
    },
    [socket, channelId],
  );

  const clearCreateError = useCallback(() => setCreateError(null), []);

  return { topics, loading, creating, createError, clearCreateError, create };
}
