import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { playSound } from "../notify/sounds";

/**
 * A socket to every server you have joined, and one of them is the one you are
 * looking at.
 *
 * It used to be one connection, to the active server, torn down and rebuilt on
 * every switch. That cost three things: nothing arrived from a server you were
 * not looking at, so no unread badge was possible anywhere — `UnreadPill` sat
 * unused for months and was deleted — switching was a visible connect, prove,
 * join, fetch, and you appeared offline everywhere but here. GRYT-496.
 *
 * **Hybrid, not symmetric.** Every server gets a socket so you are online on
 * all of them and messages arrive from all of them. Only the active one is
 * *listened to* properly:
 *
 * - The active server is exactly what it was. `useServerConnection` returns it,
 *   so every screen, the voice engine, the member list and the profile are
 *   unchanged — they ask for "the connection" and get the one you are looking
 *   at.
 * - The rest carry messages and nothing else. Who is online, who joined a voice
 *   channel, who changed their name on a server you are not looking at is not
 *   worth waking anything for — it is fetched when you open that server.
 *
 * That asymmetry is the whole design and it is why this is cheap. The sockets
 * are open either way; what would cost is doing something with everything that
 * arrives on ten of them.
 */

interface Connections {
  /** The server you are looking at. Idle when you are in none. */
  active: Connection;
  /** Every joined server that has published a connection yet, by host. */
  byHost: Record<string, Connection>;
  /** Messages that arrived while you were not looking, by host. */
  unread: Record<string, number>;
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
 * The connections, or null where there are none to have.
 *
 * This provider is mounted inside the tabs, so the screens pushed *over* them
 * — the identity page, preferences, the auth server, the report form — are
 * outside it. Everything that is genuinely about a server is inside the tabs
 * and should keep using `useConnections`, which throws for a reason.
 *
 * This is for the other case: something that would *like* to mention the
 * server if there is one and is not about a server at all. The report form
 * attaches the server version and whether you were connected, which makes a bug
 * report much easier to read and is not worth crashing a form over.
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

  /* Looking at a server is what clears it. Not opening a particular channel:
   * the count is "something happened here while you were elsewhere", and you
   * are no longer elsewhere. Per-channel unread is a different feature with a
   * read cursor behind it, and the server has no such thing yet. */
  useEffect(() => {
    if (!host) return;
    setUnread((prev) => (prev[host] ? { ...prev, [host]: 0 } : prev));
  }, [host]);

  const value = useMemo<Connections>(
    () => ({ active: (host && byHost[host]) || IDLE, byHost, unread }),
    [host, byHost, unread],
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
        />
      ))}
      {children}
    </ConnectionsContext.Provider>
  );
}

/**
 * One server's socket, and the little that is done with it when it is not the
 * one on screen.
 *
 * Draws nothing. It exists because `useConnection` is a hook and there are as
 * many of them as there are servers, which React can only express as a
 * component each.
 */
function ServerConnection({
  server,
  nickname,
  active,
  publish,
  onMessage,
}: {
  server: JoinedServer;
  nickname: string;
  active: boolean;
  publish: (host: string, connection: Connection | null) => void;
  onMessage: (host: string) => void;
}) {
  const { getAccessToken } = useGrytAccount();
  const toast = useToast();
  const { sounds: soundsOn } = useAppearance();
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
   * What a server you are not looking at is for.
   *
   * A message arrived: count it, and say so once. Nothing else on this socket
   * is read — not the member list, not voice, not presence — because all of it
   * is fetched when you open the server, and none of it is worth a toast about
   * a room you are not in.
   *
   * `channelNameById` comes from `server:details`, which the connection asks
   * for on every server rather than only the active one. That is the one thing
   * a background connection does eagerly, and it is what lets the toast say
   * which channel rather than just which server.
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
      if (soundsOn) playSound("message");

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

  return null;
}

export type { Connection, ServerDetails };
