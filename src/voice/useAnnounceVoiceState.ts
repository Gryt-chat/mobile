import { useEffect } from "react";
import type { Socket } from "socket.io-client";

import type { VoiceState } from "../shell/ShellContext";
import { voiceStateReport } from "./voiceState";

/**
 * Tells this server's room what your microphone is doing.
 *
 * Three things it is careful about:
 *
 * **It re-announces on every reconnect, not only on a change.** `online` goes
 * false and true again on a dropped socket, and the server rebuilt the client
 * record in between — so a phone that muted before the drop and changed nothing
 * after it would come back unmuted to everybody else, having sent nothing
 * because nothing changed. Depending on `online` is what makes the reconnect
 * its own announcement.
 *
 * **It waits for `online` rather than `socket.connected`.** Connected is not
 * joined: the socket is up well before the proof is answered, and a
 * `voice:state:update` sent in that window is one the server drops on the floor
 * because it has no client record to write it to.
 *
 * **And it re-announces when you enter a voice channel**, which is the one that
 * was missing. The server only forwards this state to the SFU when the sender
 * has already joined a channel — `handlers/voice.ts` guards the
 * `updateUserAudioState` call on `hasJoinedChannel`. Announcing on `online`
 * happens strictly *before* joining anything, so in a session where nobody
 * touches the mute button afterwards, the SFU is never told anything at all.
 * Deafen is the half that actually matters there, because the SFU enforces it
 * (`SetUserDeafened`) while mute is applied on the client.
 *
 * The channel id is a dependency rather than a separate effect so that moving
 * between channels re-announces too — that is a new room and a new record.
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
