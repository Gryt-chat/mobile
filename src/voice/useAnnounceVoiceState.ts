import { useEffect } from "react";
import type { Socket } from "socket.io-client";

import type { VoiceState } from "../shell/ShellContext";
import { voiceStateReport } from "./voiceState";

/**
 * Tells this server's room what your microphone is doing. Re-announced on reconnect and on
 * entering a channel, and it waits for `online` rather than `socket.connected`.
 */
export function useAnnounceVoiceState(
  socket: Socket | null,
  online: boolean,
  voice: VoiceState,
  voiceChannelId: string | null,
) {
  useEffect(() => {
    if (!socket || !online) return;
    socket.emit("voice:state:update", voiceStateReport(voice));
  }, [socket, online, voiceChannelId, voice.muted, voice.deafened]);
}
