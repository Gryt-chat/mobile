import { useCallback, useEffect, useRef } from "react";
import { useToast } from "@gryt/ui-native";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";

/**
 * Acting on somebody. Whether you may is `moderationAbilities`, off `server:details`
 * rather than the list behind `manage_roles`. Fire-and-forget; the broadcast redraws.
 */
export function useModeration() {
  const { socket, getAccessToken } = useServerConnection();
  const { all } = useMembers();
  const toast = useToast();

  /* The success events carry the id and no name, so it is looked up here. In a ref,
   * so the listeners do not resubscribe every time somebody's presence changes. */
  const members = useRef(all);
  members.current = all;
  const nameOf = useCallback(
    (id: string | undefined) =>
      members.current.find((m) => m.serverUserId === id)?.nickname ?? "them",
    [],
  );

  useEffect(() => {
    if (!socket) return;

    const said = (message: string) => toast.show({ description: message });

    type Acted = { targetServerUserId?: string };

    /* Phrased as what you did rather than what happened to them: the name goes in the
     * middle either way, and the other order produces "Ada were banned". */
    const onKicked = (p: Acted) => said(`Removed ${nameOf(p?.targetServerUserId)} from the server.`);
    const onBanned = (p: Acted) => said(`Banned ${nameOf(p?.targetServerUserId)}.`);
    const onMuted = (p: Acted & { muted?: boolean }) =>
      said(`${p?.muted ? "Muted" : "Unmuted"} ${nameOf(p?.targetServerUserId)}.`);
    const onDeafened = (p: Acted & { deafened?: boolean }) =>
      said(`${p?.deafened ? "Deafened" : "Undeafened"} ${nameOf(p?.targetServerUserId)}.`);

    socket.on("server:kick:success", onKicked);
    socket.on("server:ban:success", onBanned);
    socket.on("server:mute:success", onMuted);
    socket.on("server:deafen:success", onDeafened);
    return () => {
      socket.off("server:kick:success", onKicked);
      socket.off("server:ban:success", onBanned);
      socket.off("server:mute:success", onMuted);
      socket.off("server:deafen:success", onDeafened);
    };
  }, [socket, toast, nameOf]);

  const send = useCallback(
    async (event: string, payload: Record<string, unknown>) => {
      if (!socket) return;
      const accessToken = await getAccessToken();
      /* Said out loud rather than dropped. The desktop returned here silently, so a
       * moderator with an expired token pressed Kick and saw nothing. */
      if (!accessToken) {
        toast.show({
          description: "Not signed in to this server. Try reconnecting.",
          severity: "error",
        });
        return;
      }
      socket.emit(event, { accessToken, ...payload });
    },
    [socket, getAccessToken, toast],
  );

  const kick = useCallback(
    (targetServerUserId: string) => send("server:kick", { targetServerUserId }),
    [send],
  );

  /* No `ban` here any more — it moved to `BanScreen`, where the four choices are made.
   * The `server:ban:success` toast stays: this hook outlives the push (GRYT-836). */

  const setMuted = useCallback(
    (targetServerUserId: string, muted: boolean) =>
      send("server:mute", { targetServerUserId, muted }),
    [send],
  );

  const setDeafened = useCallback(
    (targetServerUserId: string, deafened: boolean) =>
      send("server:deafen", { targetServerUserId, deafened }),
    [send],
  );

  return { kick, setMuted, setDeafened };
}
