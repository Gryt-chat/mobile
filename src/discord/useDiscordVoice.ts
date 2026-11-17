import { useMemo } from "react";

import { useServerConnection } from "../connection/ConnectionsProvider";
import type { Member } from "../connection/types";
import { useServerClients } from "../voice/useServerClients";

/** People in a bridged Discord voice channel, shaped as members so faces and counts include them. */
export function useDiscordVoicePeople(): Member[] {
  const { socket } = useServerConnection();
  const clients = useServerClients(socket);
  return useMemo(
    () =>
      Object.values(clients ?? {}).flatMap((c) =>
        c.discord && c.serverUserId && c.voiceChannelId
          ? [{ serverUserId: c.serverUserId, nickname: c.discord.name, voiceChannelId: c.voiceChannelId, status: "online", discordAvatar: c.discord.avatar } as Member]
          : [],
      ),
    [clients],
  );
}
