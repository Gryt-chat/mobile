import { useCallback, useEffect, useRef } from "react";
import { useToast } from "@gryt/ui-native";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";

/**
 * Acting on somebody, and knowing whether you may.
 *
 * Only the acting half. Whether you *may* is `moderationAbilities`, off the
 * roles already on `server:details` — not `server:roles:definitions:list`,
 * which the server gates behind `manage_roles`. A moderator who may kick but
 * not edit roles would have got nothing back from it, every rank would have
 * fallen back to the built-in table, and on a server with a custom role that
 * comparison fails closed: no actions offered at all, to exactly the people
 * who need them. The desktop reads `info.roles` for the same reason.
 *
 * **Every action here is fire-and-forget.** The server answers `server:*:success`
 * and broadcasts a fresh member list, which is what actually redraws the row.
 * The toast is for the moderator, who otherwise gets a sheet closing and no
 * sign anything happened — the desktop had exactly that gap until the success
 * events were added.
 */
export function useModeration() {
  const { socket, getAccessToken } = useServerConnection();
  const { all } = useMembers();
  const toast = useToast();

  /* The success events carry the id they acted on and no name, so the name is
   * looked up here. Held in a ref so the listeners below do not resubscribe
   * every time somebody's presence changes, which is often. */
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

    /* Phrased as what you did rather than what happened to them, because the
     * name goes in the middle either way and "Ada were banned" is what the
     * other order produces. The fallback is "them", which reads for anybody
     * whose row has already gone. */
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
      /* Said out loud rather than dropped. The desktop client used to return
       * here silently, so a moderator with an expired token pressed Kick and
       * saw nothing at all — neither the kick nor a reason for its absence. */
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

  /**
   * `deleteContent` true and no expiry, matching what the desktop's ban dialog
   * opens on. The phone does not offer the other choices yet — a reason, a
   * duration, revoking the invite they came in on — so it sends the defaults
   * rather than inventing different ones. GRYT-836 has the form.
   */
  const ban = useCallback(
    (targetServerUserId: string) =>
      send("server:ban", {
        targetServerUserId,
        expiresInMinutes: null,
        deleteContent: true,
        revokeInvite: false,
      }),
    [send],
  );

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

  return { kick, ban, setMuted, setDeafened };
}
