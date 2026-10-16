import { useOptionalServerConnection } from "../connection/ConnectionsProvider";
import { useShell } from "../shell/ShellContext";

/** Whether the room joined is a DM or group call rather than a channel: a call is a
    conversation's room, so it isn't in the server's channels (GRYT-1785). */
export function useInACall(): boolean {
  const { voiceChannel } = useShell();
  const state = useOptionalServerConnection()?.state;
  const id = voiceChannel?.id ?? null;
  return id !== null && state?.status === "ready" && !state.channels.some((c) => c.id === id);
}
