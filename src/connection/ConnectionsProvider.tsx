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
import { plainText } from "../chat/messageAbilities";
import type { Channel, Message, ServerDetails } from "./types";
import { useAppearance } from "../preferences/appearance";
import {
  addMention,
  applyCounts,
  clearMentions as clearMentionsIn,
  countMentionRows,
  type MentionCounts,
  type MentionsByHost,
} from "./mentions";
import { announcesMessages, isChannelMuted } from "../notify/announce";
import { resolveContactPrefs, useContactPrefs } from "./contactPrefs";
import { useSuppressEveryone } from "../notify/suppressEveryone";
import { mentionsMe } from "../chat/mentionReader";
import { playSound } from "../notify/sounds";
import { useShell } from "../shell/ShellContext";

/**
 * A socket to every server you have joined, one of which you are looking at. Every server
 * carries messages; only the active one is listened to properly (GRYT-496).
 */

interface Connections {
  /** The server you are looking at. Idle when you are in none. */
  active: Connection;
  /** Every joined server that has published a connection yet, by host. */
  byHost: Record<string, Connection>;
  /** Messages that arrived while you were not looking, by host. */
  unread: Record<string, number>;
  /**
   * Where you have been named and have not read it, by host and conversation. Per
   * channel, unlike `unread`: the server records when a mention was seen.
   */
  mentions: MentionsByHost;
  /** Somebody opened this conversation, so the mentions in it are read. */
  markMentionsRead: (host: string, conversationId: string) => void;
}

/**
 * What a screen gets before any server is joined. A real shape rather than null, so
 * `useServerConnection` is not null-checked at forty call sites.
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
 * The connections, or null where there are none. **Anything genuinely about a
 * server should keep using `useConnections`, which throws for a reason.**
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
   * channel. The server is told too — a read here has to stop showing elsewhere.
   */
  const markMentionsRead = useCallback((server: string, conversationId: string) => {
    setMentions((prev) => clearMentionsIn(prev, server, conversationId));
    setByHost((prev) => {
      prev[server]?.socket?.emit("mentions:seen", { conversationId });
      return prev;
    });
  }, []);

  /* Looking at a server is what clears it, not opening a channel: the count is
   * "something happened here while you were elsewhere". */
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
 * One server's socket, and the little done with it when it is not on screen. Draws
 * nothing: `useConnection` is a hook, so one per server is one component each.
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
   * Whether a call is running, in a ref — the chime plays from a handler that
   * outlives its render. **Not about whether to play the sound** (GRYT-578).
   */
  const { voiceChannel } = useShell();
  const inCall = useRef(false);
  inCall.current = voiceChannel !== null;
  /* Resolved here rather than inside the connection because it can involve a round
   * trip, and an effect that opens a socket should not wait on a fetch. */
  const address = useServerScheme(server.host);
  const connection = useConnection(server.host, nickname, address, getAccessToken);
  const suppressEveryone = useSuppressEveryone(server.host);

  useEffect(() => {
    publish(server.host, connection);
  }, [server.host, connection, publish]);

  /* Who may message or ring you here, told to the server on every connect and
     change (GRYT-1470). An older server ignores it; the phone still filters. */
  const contactPrefs = resolveContactPrefs(useContactPrefs(), server.host);
  useEffect(() => {
    const socket = connection.socket;
    if (!socket || !connection.online) return;
    let cancelled = false;
    void connection.getAccessToken().then((accessToken) => {
      if (cancelled || !accessToken) return;
      socket.emit("contact:prefs:set", { accessToken, ...contactPrefs });
    });
    return () => {
      cancelled = true;
    };
    // The two words, not the object, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.socket, connection.online, connection.getAccessToken, contactPrefs.messages, contactPrefs.calls]);

  useEffect(
    () => () => publish(server.host, null),
    [server.host, publish],
  );

  /**
   * What a server you are not looking at is for: a message arrived, count it and say
   * so once. The channel list is the one thing it asks for eagerly.
   */
  const [channels, setChannels] = useState<Record<string, Channel>>({});

  useEffect(() => {
    if (connection.state.status !== "ready") return;
    setChannels(Object.fromEntries(connection.state.channels.map((c) => [c.id, c])));
  }, [connection.state]);

  useEffect(() => {
    const socket = connection.socket;
    if (!socket || active) return;

    const arrived = (message: Message) => {
      /* Your own message, echoed back on a server you are not looking at. Counting
       * it would badge a server for something you did. */
      if (connection.me && message.sender_server_id === connection.me.serverUserId) return;

      /* The server talking, not a person. Two guest joins turned two messages into
       * a count of four. */
      if (isSystemMessage(message)) return;

      /* Muted is silent outright, unread pill included — the level the server
       * set for the channel decides the rest (GRYT-1465). */
      const channel = channels[message.conversation_id];
      if (!isChannelMuted(channel)) onMessage(server.host);

      const named =
        channel?.defaultNotificationLevel === "mentions" &&
        mentionsMe(message.text, {
          serverUserId: connection.me?.serverUserId,
          nickname,
          roleIds: connection.state.status === "ready" ? connection.state.details?.role_ids : undefined,
          suppressEveryone,
        });
      if (!announcesMessages(channel) && !named) return;

      /* The same condition the toast uses, so the sound and the banner are one
       * notification rather than two that can disagree. */
      if (soundsOn) playSound("message", { inCall: inCall.current });

      // Words, not markdown: a mention link or a fenced block would otherwise
      // show up in the banner exactly as typed.
      const preview = message.text
        ? plainText(message.text, (id, host) => (host && host !== server.host ? null : channels[id]?.name ?? null))
        : undefined;
      toast.show({
        title: channel ? `${server.name} · #${channel.name}` : server.name,
        description: message.sender_nickname
          ? `${message.sender_nickname}: ${preview ?? ""}`.trim()
          : preview,
      });
    };

    socket.on("chat:new", arrived);
    return () => {
      socket.off("chat:new", arrived);
    };
  }, [connection.socket, connection.me, connection.state, active, channels, server, onMessage, toast, soundsOn, nickname, suppressEveryone]);

  /**
   * Where you have been named, on every server. **Not gated on `active`.** Asked for
   * on every connect: the reply replaces what is held.
   */
  useEffect(() => {
    const socket = connection.socket;
    if (!socket) return;

    /* Counted from the rows when they say what named you, so Suppress can drop
       @everyone and @here. An older server sends no kind, and its counts stand. */
    const listed = (payload: { counts?: MentionCounts; mentions?: { conversation_id?: string; kind?: string }[] }) => {
      const rows = payload?.mentions;
      const kinds = Array.isArray(rows) && rows.some((r) => r?.kind);
      const counts = kinds ? countMentionRows(rows!, suppressEveryone) : payload?.counts ?? {};
      /* A muted channel's mentions never reach the badge, same as a plain
         message's — the level the server set for it decides this (GRYT-1465). */
      const visible = Object.fromEntries(
        Object.entries(counts).filter(([id]) => !isChannelMuted(channels[id])),
      );
      onMentionCounts(server.host, visible);
    };
    const named = (payload: { conversationId?: string; kind?: string }) => {
      if (suppressEveryone && (payload?.kind === "everyone" || payload?.kind === "here")) return;
      if (!payload?.conversationId || isChannelMuted(channels[payload.conversationId])) return;
      onMention(server.host, payload.conversationId);
    };

    socket.on("mentions:list", listed);
    socket.on("mention:new", named);
    if (connection.state.status === "ready") socket.emit("mentions:list");

    return () => {
      socket.off("mentions:list", listed);
      socket.off("mention:new", named);
    };
  }, [connection.socket, connection.state.status, server.host, channels, onMentionCounts, onMention, suppressEveryone]);

  return null;
}

export type { Connection, ServerDetails };
