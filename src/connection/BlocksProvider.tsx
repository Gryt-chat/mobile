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

/**
 * Who you have blocked on this server.
 *
 * A block is enforced entirely on the server — their messages are not
 * delivered, their history is filtered out, and a conversation between you
 * cannot be opened from either side. Nothing here hides anything.
 *
 * So this list exists for two reasons and neither is filtering. A row has to
 * be able to say whether it is already blocked, or the menu offers Block on
 * somebody who is; and blocking with no way back is a trap, so there has to be
 * a list somebody can unblock from.
 *
 * **Per server, like the block itself.** Dropped on a change of host rather
 * than merged, because a name on this list means nothing on another server.
 */

export interface BlockedPerson {
  /** The account behind them, which is what the block is actually keyed on. */
  grytUserId: string;
  /** Null once they have left the server: the block outlives the member row. */
  serverUserId: string | null;
  nickname: string | null;
  createdAt: string;
}

export interface Blocks {
  blocked: BlockedPerson[];
  /** Whether this person is blocked, by the id a member row carries. */
  isBlocked: (serverUserId: string | null | undefined) => boolean;
  block: (serverUserId: string) => Promise<void>;
  unblock: (serverUserId: string) => Promise<void>;
}

const BlocksContext = createContext<Blocks | null>(null);

export function useBlocks(): Blocks {
  const value = useContext(BlocksContext);
  if (!value) throw new Error("useBlocks must be used inside BlocksProvider.");
  return value;
}

export function BlocksProvider({
  host,
  children,
}: {
  host: string | null;
  children?: ReactNode;
}) {
  const { socket, online, getAccessToken } = useServerConnection();
  const [blocked, setBlocked] = useState<BlockedPerson[]>([]);

  useEffect(() => {
    setBlocked([]);
  }, [host]);

  useEffect(() => {
    if (!socket) return;

    const received = (payload: { blocked?: BlockedPerson[] }) => {
      if (Array.isArray(payload?.blocked)) setBlocked(payload.blocked);
    };

    /* The server answers a block or an unblock with the id it acted on rather
     * than a whole list, so the list is asked for again. One round trip on an
     * act somebody does rarely, against keeping two copies of the same truth
     * in step by hand. */
    const changed = () => {
      void refresh();
    };

    socket.on("user:blocks", received);
    socket.on("user:blocked", changed);
    socket.on("user:unblocked", changed);
    return () => {
      socket.off("user:blocks", received);
      socket.off("user:blocked", changed);
      socket.off("user:unblocked", changed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const refresh = useCallback(async () => {
    if (!socket) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("user:blocks:list", { accessToken });
  }, [socket, getAccessToken]);

  /* Asked for once the handshake has settled, the same gate the member list
   * uses: the handler refuses an unverified socket silently. */
  useEffect(() => {
    if (!online) return;
    void refresh();
  }, [online, refresh]);

  const block = useCallback(
    async (serverUserId: string) => {
      if (!socket) return;
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      socket.emit("user:block", { accessToken, serverUserId });
    },
    [socket, getAccessToken],
  );

  const unblock = useCallback(
    async (serverUserId: string) => {
      if (!socket) return;
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      socket.emit("user:unblock", { accessToken, serverUserId });
    },
    [socket, getAccessToken],
  );

  const value = useMemo<Blocks>(() => {
    /* Built once per list rather than scanned per row. The members drawer asks
       this for everybody on the server every time it draws. */
    const ids = new Set(
      blocked.map((b) => b.serverUserId).filter((id): id is string => !!id),
    );

    return {
      blocked,
      isBlocked: (serverUserId) => !!serverUserId && ids.has(serverUserId),
      block,
      unblock,
    };
  }, [blocked, block, unblock]);

  return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>;
}
