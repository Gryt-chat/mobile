import { dmKeyBindingFor } from "../identity/dmKeys";
import { dmScopeFor } from "./pins";

/**
 * Send this device's DM key binding for a server it has just settled on. After the pin:
 * the scope is the server's lineage, and earlier it derives under the address (GRYT-727).
 */
export async function publishDmKey(
  socket: { emit: (event: string, payload: unknown, ack?: (reply: { ok?: boolean }) => void) => unknown },
  host: string,
  { replace = false }: { replace?: boolean } = {},
): Promise<boolean> {
  try {
    const binding = await dmKeyBindingFor(await dmScopeFor(host));
    // A server from before GRYT-1868 never answers, and took the key anyway.
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(true), 10_000);
      socket.emit("dm:key:publish", { binding, ...(replace ? { replace } : {}) }, (reply) => {
        clearTimeout(timer);
        resolve(reply?.ok !== false);
      });
    });
  } catch {
    // No seed yet, or storage that will not answer. Nothing to retry against.
    return false;
  }
}
