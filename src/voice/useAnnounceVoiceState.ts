import { useEffect } from "react";
import type { Socket } from "socket.io-client";

import type { VoiceState } from "../shell/ShellContext";
import { voiceStateReport } from "./voiceState";

/**
 * Tells this server's room what your microphone is doing. **It re-announces on every
 * reconnect**, or a phone that muted before the drop comes back unmuted. **It waits for
 * `online`, not `socket.connected`.** **And it re-announces on entering a channel** —
 * the server only forwards this to the SFU once the sender has joined one.
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
