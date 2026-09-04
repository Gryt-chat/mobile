import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@gryt/ui-native";

import { useGrytAccount } from "../account/AccountProvider";
import { useServerScheme } from "../servers/useServerScheme";
import type { JoinedServer } from "../servers/store";
import { useConnection, type Connection } from "./useConnection";
import { isSystemMessage } from "../chat/system";
import type { Message, ServerDetails } from "./types";
import { useAppearance } from "../preferences/appearance";
import {
  addMention,
  applyCounts,
  clearMentions as clearMentionsIn,
  type MentionCounts,
  type MentionsByHost,
} from "./mentions";
import { playSound } from "../notify/sounds";
import { useShell } from "../shell/ShellContext";

/**
 * A socket to every server you have joined, and one of them is the one you are
 * looking at (GRYT-496). One connection torn down on every switch meant no
 * unread badge was possible, switching was a visible reconnect, and you
 * appeared offline everywhere but here.
 *
 * **Hybrid, not symmetric.** Every server gets a socket so you are online on
 * all of them and messages arrive from all of them. Only the active one is
 * *listened to* properly:
 *
 * - The active server is exactly what it was. `useServerConnection` returns it,
 *   so every screen, the voice engine, the member list and the profile are
 *   unchanged.
 * - The rest carry messages and nothing else. Who is online, who joined a voice
 *   channel, who changed their name on a server you are not looking at is
 *   fetched when you open that server.
 *
 * That asymmetry is why this is cheap: the sockets are open either way, and
 * what would cost is doing something with everything arriving on ten of them.
 */

interface Connections {
  /** The server you are looking at. Idle when you are in none. */
  active: Connection;
  /** Every joined server that has published a connection yet, by host. */
  byHost: Record<string, Connection>;
  /** Messages that arrived while you were not looking, by host. */
  unread: Record<string, number>;
  /**
   * Where you have been named and have not read it, by host and conversation.
   *
   * Per channel, unlike `unread` above, and that is not an inconsistency: the
   * server records when a mention was seen, so there is a cursor to be per
   * channel about. Plain unread has none.
   */
  mentions: MentionsByHost;
  /** Somebody opened this conversation, so the mentions in it are read. */
  markMentionsRead: (host: string, conversationId: string) => void;
}

/**
 * What a screen gets before any server is joined.
 *
 * A real shape rather than null, so `useServerConnection` never has to be
 * null-checked at forty call sites for a state the app spends no time in.
 */
const IDLE: Connection = {
  state: { status: "idle" },
  socket: null,
  me: null,
  online: false,
  getAccessToken: async () => null,
  rejoin: async () => {},
};

const ConnectionsContext = createContext<Connections | null>(null);

export function useConnections(): Connections {
  const value = useContext(ConnectionsContext);
  if (!value) {
    throw new Error("useConnections must be used inside ConnectionsProvider.");
  }
  return value;
}

/**
 * The connections, or null where there are none to have. This provider is
 * mounted inside the tabs, so screens pushed *over* them are outside it —
 * **anything genuinely about a server should keep using `useConnections`,
 * which throws for a reason.**
 *
 * This is for something that would like to mention the server if there is one:
 * the report form attaches the version, which is not worth crashing over.
 */
export function useOptionalConnections(): Connections | null {
  return useContext(ConnectionsContext);
}

/** The server you are looking at. What every screen has always asked for. */
export function useServerConnection(): Connection {
  return useConnections().active;
}

export function ConnectionsProvider({
  servers,
  host,
  nickname,
  children,
}: {
  servers: JoinedServer[];
  /** The active server, or null when you are in none. */
  host: string | null;
  nickname: string;
  children?: ReactNode;
}) {
  const [byHost, setByHost] = useState<Record<string, Connection>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [mentions, setMentions] = useState<MentionsByHost>({});

  const publish = useCallback((server: string, connection: Connection | null) => {
    setByHost((prev) => {
      if (connection === null) {
        if (!(server in prev)) return prev;
        const next = { ...prev };
        delete next[server];
        return next;
      }
      if (prev[server] === connection) return prev;
      return { ...prev, [server]: connection };
    });
  }, []);

  const bumpUnread = useCallback((server: string) => {
    setUnread((prev) => ({ ...prev, [server]: (prev[server] ?? 0) + 1 }));
  }, []);

  const onMentionCounts = useCallback((server: string, counts: MentionCounts) => {
    setMentions((prev) => applyCounts(prev, server, counts));
  }, []);

  const onMention = useCallback((server: string, conversationId: string) => {
    setMentions((prev) => addMention(prev, server, conversationId));
  }, []);

  /*
   * Cleared here as well as on the server, so the badge goes when they open the
   * channel rather than when the reply comes back. The server is told too — a
   * mention read on the phone has to stop showing on the desktop.
   */
  const markMentionsRead = useCallback((server: string, conversationId: string) => {
    setMentions((prev) => clearMentionsIn(prev, server, conversationId));
    setByHost((prev) => {
      prev[server]?.socket?.emit("mentions:seen", { conversationId });
      return prev;
    });
  }, []);

  /* Looking at a server is what clears it. Not opening a particular channel:
   * the count is "something happened here while you were elsewhere", and you
   * are no longer elsewhere. Per-channel unread is a different feature with a
   * read cursor behind it, and the server has no such thing yet. */
  useEffect(() => {
    if (!host) return;
    setUnread((prev) => (prev[host] ? { ...prev, [host]: 0 } : prev));
  }, [host]);

  const value = useMemo<Connections>(
    () => ({
      active: (host && byHost[host]) || IDLE,
      byHost,
      unread,
      mentions,
      markMentionsRead,
    }),
    [host, byHost, unread, mentions, markMentionsRead],
  );

  return (
    <ConnectionsContext.Provider value={value}>
      {/* One per joined server, keyed by host so switching does not remount
          anything — which is what makes a switch instant rather than a fresh
          handshake. */}
      {servers.map((server) => (
        <ServerConnection
          key={server.host}
          server={server}
          nickname={nickname}
          active={server.host === host}
          publish={publish}
          onMessage={bumpUnread}
          onMentionCounts={onMentionCounts}
          onMention={onMention}
        />
      ))}
      {children}
    </ConnectionsContext.Provider>
  );
}

/**
 * One server's socket, and the little done with it when it is not the one on
 * screen. Draws nothing — it exists because `useConnection` is a hook and React
 * can only express one per server as a component each.
 */
function ServerConnection({
  server,
  nickname,
  active,
  publish,
  onMessage,
  onMentionCounts,
  onMention,
}: {
  server: JoinedServer;
  nickname: string;
  active: boolean;
  publish: (host: string, connection: Connection | null) => void;
  onMessage: (host: string) => void;
  onMentionCounts: (host: string, counts: MentionCounts) => void;
  onMention: (host: string, conversationId: string) => void;
}) {
  const { getAccessToken } = useGrytAccount();
  const toast = useToast();
  const { sounds: soundsOn } = useAppearance();

  /**
   * Whether a call is running, in a ref — the chime plays from a socket handler
   * that outlives the render it was attached in, so a closure would ask about
   * the call running when the listener went on.
   *
   * **Not about whether to play the sound**, but whether playing it may
   * reconfigure the audio session (GRYT-578).
   */
  const { voiceChannel } = useShell();
  const inCall = useRef(false);
  inCall.current = voiceChannel !== null;
  /* Resolved here rather than inside the connection because it can involve a
   * round trip, and an effect that opens a socket should not also be the thing
   * waiting on a fetch. GRYT-499. */
  const address = useServerScheme(server.host);
  const connection = useConnection(server.host, nickname, address, getAccessToken);

  useEffect(() => {
    publish(server.host, connection);
  }, [server.host, connection, publish]);

  useEffect(
    () => () => publish(server.host, null),
    [server.host, publish],
  );

  /**
   * What a server you are not looking at is for: a message arrived, count it
   * and say so once. Nothing else on this socket is read, because all of it is
   * fetched when you open the server.
   *
   * `channelNameById` comes from `server:details`, **the one thing a background
   * connection asks for eagerly** — it is what lets the toast name the channel.
   */
  const [channels, setChannels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (connection.state.status !== "ready") return;
    setChannels(
      Object.fromEntries(connection.state.channels.map((c) => [c.id, c.name])),
    );
  }, [connection.state]);

  useEffect(() => {
    const socket = connection.socket;
    if (!socket || active) return;

    const arrived = (message: Message) => {
      /* Your own message, echoed back on a server you are not looking at —
       * which happens, because the socket stays live while you are elsewhere.
       * Counting it would badge a server for something you did. */
      if (connection.me && message.sender_server_id === connection.me.serverUserId) return;

      /* The server talking, not a person. "Somebody joined the server" is not
       * something to interrupt for or to carry a badge — found by testing,
       * where two guest joins turned two messages into a count of four. */
      if (isSystemMessage(message)) return;

      onMessage(server.host);

      /* The same condition the toast already uses, so the sound and the banner
       * are one notification rather than two that can disagree: not yours, not
       * the server talking, and not the server you are looking at. */
      if (soundsOn) playSound("message", { inCall: inCall.current });

      const channel = channels[message.conversation_id];
      toast.show({
        title: channel ? `${server.name} · #${channel}` : server.name,
        description: message.sender_nickname
          ? `${message.sender_nickname}: ${message.text ?? ""}`.trim()
          : (message.text ?? undefined),
      });
    };

    socket.on("chat:new", arrived);
    return () => {
      socket.off("chat:new", arrived);
    };
  }, [connection.socket, connection.me, active, channels, server, onMessage, toast, soundsOn]);

  /**
   * Where you have been named, on every server. **Not gated on `active`** — a
   * badge on a channel you are not in is the point, and that channel is usually
   * on the server you are looking at.
   *
   * Asked for on every connect rather than the first: the reply replaces what
   * is held, which is how a read on the desktop stops showing here.
   */
  useEffect(() => {
    const socket = connection.socket;
    if (!socket) return;

    const listed = (payload: { counts?: MentionCounts }) => {
      onMentionCounts(server.host, payload?.counts ?? {});
    };
    const named = (payload: { conversationId?: string }) => {
      if (payload?.conversationId) onMention(server.host, payload.conversationId);
    };

    socket.on("mentions:list", listed);
    socket.on("mention:new", named);
    if (connection.state.status === "ready") socket.emit("mentions:list");

    return () => {
      socket.off("mentions:list", listed);
      socket.off("mention:new", named);
    };
  }, [connection.socket, connection.state.status, server.host, onMentionCounts, onMention]);

  return null;
}

export type { Connection, ServerDetails };
