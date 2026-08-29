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

/**
 * The direct messages open on this server.
 *
 * One server. A DM here has nothing to do with a DM with the same person on a
 * different server — separate conversations, separate history — and the app
 * cannot tell that the two members are the same person anyway. The server
 * withholds what would make that knowable, deliberately, so that two servers
 * cannot work out they share a member.
 *
 * So this is per-socket and the list is per-server, the same shape as
 * `MembersProvider`. There is no merged view across servers and adding one
 * would mean asking for the identifier that exists in order not to be handed
 * out.
 *
 * A server from before direct messages existed answers neither `dm:list` nor
 * `dm:opened`, so the list stays empty and the section never appears. Nothing
 * here needs to know the server's version.
 */

export type { DirectConversation };

export interface DirectMessages {
  /** Most recently used first, the order the server sends. */
  conversations: DirectConversation[];
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

    const refused = (payload: { message?: string }) => {
      setError(typeof payload?.message === "string" ? payload.message : "Something went wrong");
    };

    socket.on("dm:list", listed);
    socket.on("dm:opened", opened);
    socket.on("dm:error", refused);
    return () => {
      socket.off("dm:list", listed);
      socket.off("dm:opened", opened);
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

  const value = useMemo<DirectMessages>(
    () => ({
      conversations,
      withMember: (serverUserId) =>
        conversations.find((c) => c.other.server_user_id === serverUserId),
      open,
      error,
    }),
    [conversations, open, error],
  );

  return (
    <DirectMessagesContext.Provider value={value}>{children}</DirectMessagesContext.Provider>
  );
}
