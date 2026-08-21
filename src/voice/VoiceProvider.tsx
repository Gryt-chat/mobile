import { VoiceConfigProvider, type VoiceTarget } from "@gryt/voice/native";
import { useMemo, type ReactNode } from "react";

import { useServerConnection } from "../connection/ConnectionProvider";
import { useShell } from "../shell/ShellContext";
import { voiceConfigFrom } from "./config";
import { createRoomCoordinator } from "./roomCoordinator";

/**
 * Hands the voice engine the two things it cannot work out for itself: what the
 * settings are, and how to ask this server for a room.
 *
 * Mounted inside the tabs, under `ConnectionProvider`, because the coordinator
 * is built on that server's socket. Switching servers therefore builds a new
 * one, which is right — a room granted by one server means nothing to another.
 *
 * The target is null while there is no socket, which the engine treats as
 * "nothing to do" rather than an error. That is the ordinary state on the
 * "no servers yet" screen.
 */
export function VoiceProvider({ children }: { children?: ReactNode }) {
  const { socket, state } = useServerConnection();
  const { voice } = useShell();

  const host = state.status === "ready" ? (state.details?.server_id ?? "") : "";

  /* Rebuilt only when the socket changes. A coordinator carries the listeners
   * for an in-flight access request, so rebuilding it on every settings change
   * would drop one mid-request. */
  const target = useMemo<VoiceTarget | null>(() => {
    if (!socket) return null;
    return { id: host || "server", room: createRoomCoordinator(socket, host || "server") };
  }, [socket, host]);

  /* This one *should* change with the settings — it is what re-renders the
   * engine's hooks when somebody mutes. */
  const config = useMemo(() => voiceConfigFrom({ voice }), [voice]);

  return (
    <VoiceConfigProvider config={config} target={target}>
      {children}
    </VoiceConfigProvider>
  );
}
