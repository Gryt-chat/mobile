import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useServerConnection } from "./ConnectionsProvider";
import { promoteConversation, type DirectConversation } from "./directMessages";
import { conversationTitle } from "./directMessages";

/**
 * The direct messages open on this server. No merged view: a server withholds what would
 * let two of them spot a shared member. An older server answers neither dm event.
 */

export type { DirectConversation };

export interface DirectMessages {
  /** Most recently used first, the order the server sends. Both kinds. */
  conversations: DirectConversation[];
  /** The one-to-ones. */
  directMessages: DirectConversation[];
  /** The groups, which get their own section rather than sharing one. */
  groups: DirectConversation[];
  /** The conversation with this member, if one is already open. */
  withMember: (serverUserId: string) => DirectConversation | undefined;
  /**
   * Open one, or bring the existing one forward. Fires and returns — the conversation
   * arrives on `dm:opened`, which is also how the other end hears about it.
   */
  open: (targetServerUserId: string) => void;
  /**
   * Start a group with these people, optionally named and pictured. Never converts a
   * one-to-one — that pair conversation stays as it is.
   */
  createGroup: (memberIds: string[], name?: string, iconFileId?: string | null) => void;
  /** Change a group's name, its picture, or both. `null` means the drawn one. */
  updateGroup: (
    conversationId: string,
    changes: { name?: string | null; iconFileId?: string | null },
  ) => void;
  /** Put somebody into a group. Anybody in it may. */
  addToGroup: (conversationId: string, targetServerUserId: string) => void;
  /** Leave for good. Not hiding — nothing brings this one back. */
  leaveGroup: (conversationId: string) => void;
  /** The last refusal the server sent, for a screen that wants to say why. */
  error: string | null;
  /** When it arrived, so the same words twice still count as two refusals. */
  errorAt: number;
  /** False once the server says it takes no new conversations (`allow_dms`). */
  dmsAllowed: boolean;
}

const DirectMessagesContext = createContext<DirectMessages | null>(null);

export function useDirectMessages(): DirectMessages {
  const value = useContext(DirectMessagesContext);
  if (!value) throw new Error("useDirectMessages must be used inside DirectMessagesProvider.");
  return value;
}

export function DirectMessagesProvider({
  host,
  children,
}: {
  host: string | null;
  children?: ReactNode;
}) {
  const { socket, online, getAccessToken } = useServerConnection();
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorAt, setErrorAt] = useState(0);
  const [dmsAllowed, setDmsAllowed] = useState(true);

  /* Dropped on a change of server rather than left to be replaced, so the sidebar
   * cannot show a conversation whose id this server has never heard of. */
  useEffect(() => {
    setConversations([]);
    setError(null);
    setDmsAllowed(true);
  }, [host]);

  useEffect(() => {
    if (!socket) return;

    const listed = (payload: { items?: DirectConversation[]; allow_dms?: boolean }) => {
      if (Array.isArray(payload?.items)) setConversations(payload.items);
      // An older server never says, and stays allowed until it refuses one.
      if (typeof payload?.allow_dms === "boolean") setDmsAllowed(payload.allow_dms);
    };

    const opened = (conversation: DirectConversation) => {
      if (!conversation?.conversation_id) return;
      setConversations((prev) => promoteConversation(prev, conversation));
    };

    /* Left for good, so the row goes without waiting for a fresh list. */
    const left = (payload: { conversation_id?: string }) => {
      if (!payload?.conversation_id) return;
      setConversations((prev) => prev.filter((c) => c.conversation_id !== payload.conversation_id));
    };

    const refused = (payload: { error?: string; message?: string }) => {
      setError(typeof payload?.message === "string" ? payload.message : "Something went wrong");
      setErrorAt(Date.now());
      if (payload?.error === "dms_disabled") setDmsAllowed(false);
    };

    socket.on("dm:list", listed);
    socket.on("dm:opened", opened);
    socket.on("dm:left", left);
    socket.on("dm:error", refused);
    return () => {
      socket.off("dm:list", listed);
      socket.off("dm:opened", opened);
      socket.off("dm:left", left);
      socket.off("dm:error", refused);
    };
  }, [socket]);

  /* Gated on `online` for the same reason the member list is: the handler refuses an
   * unverified socket silently, so asking early gets nothing and no error. */
  useEffect(() => {
    if (!socket || !online) return;
    let cancelled = false;
    getAccessToken().then((accessToken) => {
      if (cancelled || !accessToken) return;
      socket.emit("dm:list", { accessToken });
    });
    return () => {
      cancelled = true;
    };
  }, [socket, online, getAccessToken]);

  const open = useCallback(
    (targetServerUserId: string) => {
      if (!socket) return;
      getAccessToken().then((accessToken) => {
        if (!accessToken) return;
        socket.emit("dm:open", { accessToken, targetServerUserId });
      });
    },
    [socket, getAccessToken],
  );

  const send = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (!socket) return;
      getAccessToken().then((accessToken) => {
        if (!accessToken) return;
        socket.emit(event, { accessToken, ...payload });
      });
    },
    [socket, getAccessToken],
  );

  const value = useMemo<DirectMessages>(
    () => ({
      conversations,
      directMessages: conversations.filter((c) => c.kind !== "group"),
      groups: conversations.filter((c) => c.kind === "group"),
      /* Only one-to-ones. Answering with a group they happen to be in would put a
         private message in front of everybody else in it. */
      withMember: (serverUserId) =>
        conversations.find(
          (c) => c.kind !== "group" && c.other.server_user_id === serverUserId,
        ),
      open,
      createGroup: (memberIds, name, iconFileId) =>
        send("dm:group:create", { memberIds, name, iconFileId: iconFileId ?? undefined }),
      updateGroup: (conversationId, changes) =>
        send("dm:group:update", { conversationId, ...changes }),
      addToGroup: (conversationId, targetServerUserId) =>
        send("dm:group:add", { conversationId, targetServerUserId }),
      leaveGroup: (conversationId) => send("dm:group:leave", { conversationId }),
      error,
      errorAt,
      dmsAllowed,
    }),
    [conversations, open, send, error, errorAt, dmsAllowed],
  );

  return (
    <DirectMessagesContext.Provider value={value}>{children}</DirectMessagesContext.Provider>
  );
}
