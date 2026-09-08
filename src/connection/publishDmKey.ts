import { dmKeyBindingFor } from "../identity/dmKeys";
import { dmScopeFor } from "./pins";

/**
 * Send this device's DM key binding for a server it has just settled on. **After the
 * pin, not before**: the scope is the server's lineage, and earlier this derives under
 * the address. Failures are swallowed — no key means no encrypted messages (GRYT-727).
 */
export async function publishDmKey(
  socket: { emit: (event: string, payload: unknown) => unknown },
  host: string,
): Promise<void> {
  try {
    const binding = await dmKeyBindingFor(await dmScopeFor(host));
    socket.emit("dm:key:publish", { binding });
  } catch {
    // No seed yet, or storage that will not answer. Nothing to retry against.
  }
}
