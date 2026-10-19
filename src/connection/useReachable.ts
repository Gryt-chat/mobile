import { useEffect, useState } from "react";

import { useConnections } from "./ConnectionsProvider";
import type { Member } from "./types";

/**
 * Per server, who'd take a new DM or group add from you (GRYT-1815), asked while
 * `open`. A server that hasn't answered has no entry, and an older one never does.
 */
export function useReachable(open: boolean, lists: Record<string, readonly Member[]>): Record<string, ReadonlySet<string>> {
  const { byHost } = useConnections();
  const [reachable, setReachable] = useState<Record<string, ReadonlySet<string>>>({});

  // Asked again when somebody joins or leaves, not on every status change.
  const key = Object.entries(lists)
    .map(([host, list]) => `${host}:${byHost[host]?.online ? 1 : 0}:${list.length}`)
    .join(",");

  useEffect(() => {
    if (!open) {
      setReachable({});
      return;
    }
    let cancelled = false;
    const offs: (() => void)[] = [];
    for (const [host, list] of Object.entries(lists)) {
      const connection = byHost[host];
      const socket = connection?.socket;
      if (!socket || !connection.online || list.length === 0) continue;
      const ids = list.map((m) => m.serverUserId).slice(0, 500);
      const answer = (payload: { ids?: string[] }) => {
        if (!cancelled) setReachable((prev) => ({ ...prev, [host]: new Set(payload?.ids ?? []) }));
      };
      socket.on("contact:reachable", answer);
      offs.push(() => socket.off("contact:reachable", answer));
      void connection.getAccessToken().then((accessToken) => {
        if (!cancelled && accessToken) socket.emit("contact:reachable", { accessToken, ids });
      });
    }
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  return reachable;
}
