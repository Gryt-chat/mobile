import { dmKeyBindingFor } from "../identity/dmKeys";
import { dmScopeFor } from "./pins";

/**
 * Send this device's DM key binding for a server it has just settled on
 * (GRYT-727). Deciding about everybody else's keys is `evaluateMemberKeys` in
 * `@gryt/crypto`, which a check can reach.
 *
 * **After the pin, not before.** The scope is the server's lineage, which comes
 * out of the pin written by `settleIdentity` — earlier, this derives under the
 * address, and every message sealed to that key is unreadable.
 *
 * Failures are swallowed: no key means no encrypted messages, which is where
 * everybody started, and it is not worth failing a join over.
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
