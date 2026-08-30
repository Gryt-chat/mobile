import { dmKeyBindingFor } from "../identity/dmKeys";
import { dmScopeFor } from "./pins";

/**
 * Send this device's DM key binding for a server it has just settled on
 * (GRYT-727).
 *
 * The one part of this that needs a socket. Deciding what to do about everybody
 * else's keys is `evaluateMemberKeys` in `@gryt/crypto`, where a check can reach
 * it and where the desktop runs the same one.
 *
 * ## After the pin, not before
 *
 * The scope is the server's lineage, which comes out of the pin, and the pin is
 * written by `settleIdentity`. Publishing earlier would derive under the address
 * instead — a different key, a binding for a scope nobody will verify against,
 * and every message anybody sealed to it unreadable.
 *
 * ## Failures are swallowed
 *
 * A key that did not reach the server means no encrypted messages with this
 * person, which is where everybody started. It is not worth failing a join over
 * and there is nothing for a reader to do about it.
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
