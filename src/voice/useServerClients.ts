import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ServerClient } from "./shares";

/**
 * `server:clients` — the server's view of everybody connected. Attached for as long as
 * there is a socket: the server emits on change, so a call-time listener misses it.
 */
// The latest list per socket, so a screen that mounts after an emit still has it; the voice sheet listens from the start.
const latest = new WeakMap<Socket, Record<string, ServerClient>>();

export function useServerClients(socket: Socket | null) {
  const [clients, setClients] = useState<Record<string, ServerClient> | null>(() => (socket ? (latest.get(socket) ?? null) : null));

  useEffect(() => {
    if (!socket) {
      /* Cleared rather than kept. A stale list would say somebody is still
       * sharing on a server this device has left. */
      setClients(null);
      return;
    }

    setClients(latest.get(socket) ?? null);
    const onClients = (payload: unknown) => {
      const next = payload && typeof payload === "object" ? (payload as Record<string, ServerClient>) : null;
      if (next) latest.set(socket, next);
      setClients(next);
    };

    socket.on("server:clients", onClients);
    return () => {
      socket.off("server:clients", onClients);
    };
  }, [socket]);

  return clients;
}
