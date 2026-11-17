import { useEffect, useRef, useState } from "react";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { getServerHttpBase } from "../servers/address";

export type DiscordStatus = "online" | "idle" | "dnd" | "offline";

export interface DiscordPerson {
  discordUserId: string;
  name: string;
  avatar: string;
  status: DiscordStatus;
}

const ORDER: Record<DiscordStatus, number> = { online: 0, idle: 1, dnd: 2, offline: 3 };

/** People still on Discord, from a server with the bridge. The server nudges `discord:people` when one changes. */
export function useDiscordPeople(host: string | null): DiscordPerson[] {
  const { socket, getAccessToken, state } = useServerConnection();
  const enabled = state.status === "ready" && state.details?.discord_bridge === true;
  const [people, setPeople] = useState<DiscordPerson[]>([]);
  const token = useRef(getAccessToken);
  token.current = getAccessToken;

  useEffect(() => {
    if (!enabled || !host) return;
    let live = true;
    const load = async () => {
      const access = await token.current().catch(() => null);
      if (!access || !live) return;
      try {
        const res = await fetch(`${getServerHttpBase(host)}/api/discord/people`, { headers: { Authorization: `Bearer ${access}` } });
        if (!res.ok || !live) return;
        const body = (await res.json()) as { people?: DiscordPerson[] };
        setPeople([...(body.people ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name)));
      } catch {
        // Tried again on the next nudge.
      }
    };
    void load();
    socket?.on("discord:people", load);
    return () => {
      live = false;
      socket?.off("discord:people", load);
    };
  }, [enabled, host, socket]);

  return enabled ? people : [];
}

export function statusLabel(status: DiscordStatus): string {
  return { online: "Online", idle: "Idle", dnd: "Do not disturb", offline: "Offline" }[status];
}
