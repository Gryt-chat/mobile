import { createContext, useContext, type ReactNode } from "react";

import { useConnection, type Connection } from "./useConnection";

/**
 * One connection, shared by every screen.
 *
 * It used to live inside the Server screen, which was fine while that screen
 * was the only thing talking to a server. A channel needs the same socket —
 * and it has to be the *same* one, because a join is per connection: a second
 * socket would be a second unauthenticated client that has to redo the whole
 * handshake in order to ask for a page of messages.
 *
 * Mounted inside the tabs rather than at the root so it unmounts with them,
 * and so the "no servers" scene never opens a socket to nothing.
 */
const ConnectionContext = createContext<Connection | null>(null);

export function useServerConnection(): Connection {
  const value = useContext(ConnectionContext);
  if (!value) {
    throw new Error("useServerConnection must be used inside ConnectionProvider.");
  }
  return value;
}

export function ConnectionProvider({
  host,
  nickname,
  children,
}: {
  host: string | null;
  nickname: string;
  children?: ReactNode;
}) {
  const connection = useConnection(host, nickname);
  return (
    <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>
  );
}
