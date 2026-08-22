import { createContext, useContext, type ReactNode } from "react";

import { useGrytAccount } from "../account/AccountProvider";
import { useServerScheme } from "../servers/useServerScheme";
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
  const { getAccessToken } = useGrytAccount();
  /* Resolved here rather than inside the connection because it can involve a
   * round trip, and an effect that opens a socket should not also be the thing
   * waiting on a fetch. GRYT-499. */
  const address = useServerScheme(host);
  const connection = useConnection(host, nickname, address, getAccessToken);
  return (
    <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>
  );
}
