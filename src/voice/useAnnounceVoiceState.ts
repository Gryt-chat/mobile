import { useEffect } from "react";
import type { Socket } from "socket.io-client";

import type { VoiceState } from "../shell/ShellContext";
import { isSpeakDenial, voiceStateReport } from "./voiceState";

/**
 * Tells this server's room what your microphone is doing, and listens for it
 * saying no.
 *
 * Two things it is careful about:
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
 */
export function useAnnounceVoiceState(
  socket: Socket | null,
  online: boolean,
  voice: VoiceState,
  setVoice: (patch: Partial<VoiceState>) => void,
) {
  useEffect(() => {
    if (!socket || !online) return;
    socket.emit("voice:state:update", voiceStateReport(voice));
  }, [socket, online, voice.muted, voice.deafened]);

  useEffect(() => {
    if (!socket) return;

    /* `voice:room:error` carries the refusals for requesting a room as well,
     * and the room coordinator is already listening for those on its own
     * one-shot handler. This reads the same channel for the one that arrives
     * without anybody having asked for anything. */
    const onError = (payload: unknown) => {
      if (isSpeakDenial(payload)) setVoice({ muted: true });
    };

    socket.on("voice:room:error", onError);
    return () => {
      socket.off("voice:room:error", onError);
    };
  }, [socket, setVoice]);
}
