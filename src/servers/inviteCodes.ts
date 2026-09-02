import * as SecureStore from "expo-secure-store";

import { normalizeCode } from "./address";

/**
 * The invite code a server was joined on, kept for as long as the membership is.
 *
 * A code is needed at every `server:join`, not only the first one. The socket
 * re-joins on reconnect and after a token expires, and a server with
 * `join_policy` set to `invite` refuses each of those the same way it refuses
 * the first — so a code held only in the Add-a-server sheet buys exactly one
 * connection and then locks the phone out of a server it is already a member of.
 * The desktop client learned this first and keeps the code on the server record
 * as `token`, re-sending it on every join (`useSockets.ts`).
 *
 * Here it lives beside the tokens rather than on the record, because the servers
 * list is display data — it is read to draw the switcher, handed around, and
 * written back whenever a name changes. A shared secret that gets somebody into
 * a private server does not belong in that blob.
 *
 * Keyed per host, and worthless at any other: the code is checked against the
 * invite that one server issued.
 */

const PREFIX = "gryt.invite.";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Hex for the same reason `tokens.ts` uses it — a host may carry a colon. */
function keyFor(host: string): string {
  let hex = "";
  for (const byte of new TextEncoder().encode(host)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return PREFIX + hex;
}

export async function readInviteCode(host: string): Promise<string | undefined> {
  try {
    const code = await SecureStore.getItemAsync(keyFor(host), OPTIONS);
    return code ?? undefined;
  } catch {
    // Unreadable storage means joining without one, which fails the same way a
    // wrong code does and is at least a message somebody can act on.
    return undefined;
  }
}

/**
 * Stored in the form the server will compare against — `normalizeCode` is the
 * same trim, squeeze and lowercase the desktop client applies, and the server
 * lowercases and trims again before it looks an invite up.
 */
export async function rememberInviteCode(host: string, code: string): Promise<void> {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  try {
    await SecureStore.setItemAsync(keyFor(host), normalized, OPTIONS);
  } catch {
    // The join about to happen still carries the code in memory; only the
    // reconnect after a restart loses it.
  }
}

export async function forgetInviteCode(host: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(keyFor(host), OPTIONS);
  } catch {
    // ignore
  }
}
