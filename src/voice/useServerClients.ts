import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import type { ServerClient } from "./shares";

/**
 * `server:clients` — the server's view of everybody *connected*, as opposed to
 * `members:list`, which is everybody who is a member. The fields that only
 * exist here are the live ones: whether a camera or a screen share is on, and
 * which stream carries it.
 *
 * **Attached for as long as there is a socket, not only during a call.** That
 * was the first shape and it did not work: the server emits this *on change*
 * and never on request — `syncAllClients` hashes the state and returns early
 * when nothing moved. A listener attached at the moment a call starts has
 * already missed the emit the call itself caused. Measured rather than
 * reasoned: with the gate in place, joining a call logged no `server:clients`
 * at all.
 *
 * Listening always costs nothing on the wire. The server broadcasts to the room
 * whether or not this handler exists.
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
