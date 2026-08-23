import { VoiceConfigProvider, VoiceSingletonHooks, type VoiceTarget } from "@gryt/voice/native";
import { useMemo, type ReactNode } from "react";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useShell } from "../shell/ShellContext";
import { voiceConfigFrom } from "./config";
import { createRoomCoordinator } from "./roomCoordinator";
import { useAnnounceVoiceState } from "./useAnnounceVoiceState";

/**
 * Hands the voice engine the two things it cannot work out for itself: what the
 * settings are, and how to ask this server for a room.
 *
 * Mounted inside the tabs, under `ConnectionsProvider`, because the coordinator
 * is built on that server's socket. Switching servers therefore builds a new
 * one, which is right — a room granted by one server means nothing to another.
 *
 * The target is null while there is no socket, which the engine treats as
 * "nothing to do" rather than an error. That is the ordinary state on the
 * "no servers yet" screen.
 */
export function VoiceProvider({ children }: { children?: ReactNode }) {
  const { socket, online, state } = useServerConnection();
  const { voice, setVoice } = useShell();

  /* The other half of muting. `voiceConfigFrom` below is what makes the
   * microphone go quiet; this is what makes anybody else know it did. */
  useAnnounceVoiceState(socket, online, voice, setVoice);

  const host = state.status === "ready" ? (state.details?.server_id ?? "") : "";

  /* Rebuilt only when the socket changes. A coordinator carries the listeners
   * for an in-flight access request, so rebuilding it on every settings change
   * would drop one mid-request. */
  const target = useMemo<VoiceTarget | null>(() => {
    if (!socket) return null;
    return { id: host || "server", room: createRoomCoordinator(socket, host || "server") };
  }, [socket, host]);

  const stunHosts = state.status === "ready" ? state.stunHosts : [];

  /* This one *should* change with the settings — it is what re-renders the
   * engine's hooks when somebody mutes. */
  const config = useMemo(() => voiceConfigFrom({ voice, stunHosts }), [voice, stunHosts]);

  return (
    <VoiceConfigProvider config={config} target={target}>
      {/* Runs the body of every singleton hook in the package, once.
       *
       * Without it nothing fails. `useSFU()` hands back its initial value
       * forever, so `connect()` is the no-op from that object: it typechecks,
       * it builds, the promise resolves, and no request ever reaches the
       * server. The package's own comment predicts exactly that, and this was
       * still missed the first time — found by watching a server log stay
       * empty while the app reported success. */}
      <VoiceSingletonHooks />
      {children}
    </VoiceConfigProvider>
  );
}
