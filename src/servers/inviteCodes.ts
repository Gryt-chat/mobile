import * as SecureStore from "expo-secure-store";

import { normalizeCode } from "./address";

/**
 * The invite code a server was joined on, kept as long as the membership — every
 * `server:join` needs one, reconnects included. Beside the tokens, keyed per host.
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
 * Stored in the form the server will compare against: `normalizeCode` is the same trim,
 * squeeze and lowercase the desktop applies, and the server does it again.
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
