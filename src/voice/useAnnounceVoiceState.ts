import { useEffect } from "react";
import type { Socket } from "socket.io-client";

import type { VoiceState } from "../shell/ShellContext";
import { voiceStateReport } from "./voiceState";

/**
 * Tells this server's room what your microphone is doing. Three things it is
 * careful about, all of them dependencies of one effect:
 *
 * **It re-announces on every reconnect, not only on a change.** The server
 * rebuilt the client record in between, so a phone that muted before the drop
 * comes back unmuted to everybody else having sent nothing.
 *
 * **It waits for `online`, not `socket.connected`.** Connected is not joined,
 * and a `voice:state:update` sent in that window has no client record to write
 * to.
 *
 * **And it re-announces on entering a voice channel.** The server only forwards
 * this to the SFU once the sender has joined one. Deafen is the half that
 * matters there, since the SFU enforces it and mute is applied on the client.
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
