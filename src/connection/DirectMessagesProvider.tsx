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
 * The direct messages open on this server.
 *
 * One server. A DM here has nothing to do with a DM with the same person on a
 * different server — separate conversations, separate history — and the app
 * cannot tell that the two members are the same person anyway. The server
 * withholds what would make that knowable, deliberately, so that two servers
 * cannot work out they share a member.
 *
 * So this is per-socket and the list is per-server. There is no merged view
 * across servers, and adding one would mean asking for the identifier that
 * exists in order not to be handed out.
 *
 * A server from before direct messages answers neither `dm:list` nor
 * `dm:opened`, so the list stays empty and the section never appears.
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
   * Open one, or bring the existing one forward.
   *
   * Fires and returns. The conversation arrives on `dm:opened`, which is also
   * how the other end hears about it — waiting on a reply here would mean two
   * paths into the same state.
   */
  open: (targetServerUserId: string) => void;
  /**
   * Take a conversation out of your own list, or put it back.
   *
   * Yours alone — the other person's list does not change and they are not
   * told. A message arriving brings it back, which is why this is a way to
   * tidy a sidebar rather than a way to stop somebody talking to you.
   */
  setHidden: (conversationId: string, hidden: boolean) => void;
  /**
   * Start a group with these people, optionally named and pictured.
   *
   * Never converts a one-to-one — the pair conversation those people already
   * had stays as it is.
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

  /* Dropped on a change of server rather than left to be replaced, so the
   * sidebar cannot show a conversation from the server you just left — whose id
   * this server has never heard of. */
  useEffect(() => {
    setConversations([]);
    setError(null);
  }, [host]);

  useEffect(() => {
    if (!socket) return;

    const listed = (payload: { items?: DirectConversation[] }) => {
      if (Array.isArray(payload?.items)) setConversations(payload.items);
    };

    const opened = (conversation: DirectConversation) => {
      if (!conversation?.conversation_id) return;
      setConversations((prev) => promoteConversation(prev, conversation));
    };

    /* The server's answer, which is also what a second device hears. Removing
       the row locally on the tap would look right on this phone and leave it
       sitting there on the desktop until something else refreshed the list. */
    const hiddenChanged = (payload: { conversation_id?: string; hidden?: boolean }) => {
      if (!payload?.conversation_id || payload.hidden !== true) return;
      setConversations((prev) =>
        prev.filter((c) => c.conversation_id !== payload.conversation_id),
      );
    };

    /* Left for good, so the row goes without waiting for a fresh list. */
    const left = (payload: { conversation_id?: string }) => {
      if (!payload?.conversation_id) return;
      setConversations((prev) => prev.filter((c) => c.conversation_id !== payload.conversation_id));
    };

    const refused = (payload: { message?: string }) => {
      setError(typeof payload?.message === "string" ? payload.message : "Something went wrong");
    };

    socket.on("dm:list", listed);
    socket.on("dm:opened", opened);
    socket.on("dm:hidden", hiddenChanged);
    socket.on("dm:left", left);
    socket.on("dm:error", refused);
    return () => {
      socket.off("dm:list", listed);
      socket.off("dm:opened", opened);
      socket.off("dm:hidden", hiddenChanged);
      socket.off("dm:left", left);
      socket.off("dm:error", refused);
    };
  }, [socket]);

  /* Gated on `online` for the same reason the member list is: the handler
   * refuses an unverified socket silently, so asking the moment the socket
   * connects gets nothing back and no error either. */
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

  const setHidden = useCallback(
    (conversationId: string, hidden: boolean) => {
      if (!socket) return;
      getAccessToken().then((accessToken) => {
        if (!accessToken) return;
        socket.emit("dm:setHidden", { accessToken, conversationId, hidden });
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
      /* Only one-to-ones. Asking "do I have a conversation with this person"
         must not answer with a group they happen to be in — opening it would
         put a private message in front of everybody else in that group. */
      withMember: (serverUserId) =>
        conversations.find(
          (c) => c.kind !== "group" && c.other.server_user_id === serverUserId,
        ),
      open,
      setHidden,
      createGroup: (memberIds, name, iconFileId) =>
        send("dm:group:create", { memberIds, name, iconFileId: iconFileId ?? undefined }),
      updateGroup: (conversationId, changes) =>
        send("dm:group:update", { conversationId, ...changes }),
      addToGroup: (conversationId, targetServerUserId) =>
        send("dm:group:add", { conversationId, targetServerUserId }),
      leaveGroup: (conversationId) => send("dm:group:leave", { conversationId }),
      error,
    }),
    [conversations, open, setHidden, send, error],
  );

  return (
    <DirectMessagesContext.Provider value={value}>{children}</DirectMessagesContext.Provider>
  );
}
