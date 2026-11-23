import { useEffect, useState } from "react";

import { useConnections } from "./ConnectionsProvider";
import type { Member } from "./types";

/** The last answer per server, so a picker opened again is right from the first frame. */
const lastAnswer: Record<string, ReadonlySet<string>> = {};
/** An older server never answers; past this the picker shows everyone. */
const GIVE_UP_MS = 2000;

/**
 * Per server, who'd take a new DM or group add from you (GRYT-1815), asked while
 * `open`. `settled` once every server asked has answered, or has had its chance.
 */
export function useReachable(
  open: boolean,
  lists: Record<string, readonly Member[]>,
): { reachable: Record<string, ReadonlySet<string>>; settled: boolean } {
  const { byHost } = useConnections();
  const [reachable, setReachable] = useState<Record<string, ReadonlySet<string>>>(() => ({ ...lastAnswer }));
  const [gaveUp, setGaveUp] = useState(false);

  // Asked again when somebody joins or leaves, not on every status change.
  const key = Object.entries(lists)
    .map(([host, list]) => `${host}:${byHost[host]?.online ? 1 : 0}:${list.length}`)
    .join(",");

  useEffect(() => {
    if (!open) {
      setReachable({ ...lastAnswer });
      setGaveUp(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => !cancelled && setGaveUp(true), GIVE_UP_MS);
    const offs: (() => void)[] = [];
    for (const [host, list] of Object.entries(lists)) {
      const connection = byHost[host];
      const socket = connection?.socket;
      if (!socket || !connection.online || list.length === 0) continue;
      const ids = list.map((m) => m.serverUserId).slice(0, 500);
      const answer = (payload: { ids?: string[] }) => {
        const ids = new Set(payload?.ids ?? []);
        lastAnswer[host] = ids;
        if (!cancelled) setReachable((prev) => ({ ...prev, [host]: ids }));
      };
      socket.on("contact:reachable", answer);
      offs.push(() => socket.off("contact:reachable", answer));
      void connection.getAccessToken().then((accessToken) => {
        if (!cancelled && accessToken) socket.emit("contact:reachable", { accessToken, ids });
      });
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      offs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const settled =
    gaveUp ||
    Object.entries(lists).every(([host, list]) => list.length === 0 || !byHost[host]?.online || reachable[host] !== undefined);
  return { reachable, settled };
}
