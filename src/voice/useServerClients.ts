import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ServerClient } from "./shares";

/**
 * `server:clients` — the server's view of everybody *connected*, carrying the live
 * fields. **Attached for as long as there is a socket, not only during a call**: the
 * server emits on change and never on request, so a listener attached when a call starts
 * has already missed the emit the call caused. Listening always costs nothing.
 */
export function useServerClients(socket: Socket | null) {
  const [clients, setClients] = useState<Record<string, ServerClient> | null>(null);

  useEffect(() => {
    if (!socket) {
      /* Cleared rather than kept. A stale list would say somebody is still
       * sharing on a server this device has left. */
      setClients(null);
      return;
    }

    const onClients = (payload: unknown) => {
      setClients(
        payload && typeof payload === "object" ? (payload as Record<string, ServerClient>) : null,
      );
    };

    socket.on("server:clients", onClients);
    return () => {
      socket.off("server:clients", onClients);
    };
  }, [socket]);

  return clients;
}
