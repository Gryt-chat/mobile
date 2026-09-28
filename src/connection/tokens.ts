import * as SecureStore from "expo-secure-store";

import { forgetFileAccess, hasFileAccess, holdFileAccess } from "./fileAccess";

/**
 * The tokens a join hands back, kept so the next launch does not start over. In the
 * Keychain, as bearer credentials, keyed per host — the token names its `serverHost`.
 */

const ACCESS_PREFIX = "gryt.token.access.";
const REFRESH_PREFIX = "gryt.token.refresh.";
const FILE_PREFIX = "gryt.token.file.";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * SecureStore keys may only contain alphanumerics, `.`, `-` and `_`, and a host carries
 * a colon whenever it names a port. Hex, because base64url is not in that set either.
 */
function keyFor(prefix: string, host: string): string {
  let hex = "";
  for (const byte of new TextEncoder().encode(host)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return prefix + hex;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
}

export async function readTokens(host: string): Promise<StoredTokens | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(keyFor(ACCESS_PREFIX, host), OPTIONS);
    if (!accessToken) return null;
    const refreshToken = await SecureStore.getItemAsync(keyFor(REFRESH_PREFIX, host), OPTIONS);
    return { accessToken, refreshToken: refreshToken ?? undefined };
  } catch {
    // Unreadable storage means no session, which costs a fresh join rather
    // than an error somebody has to understand.
    return null;
  }
}

export async function writeTokens(host: string, tokens: StoredTokens): Promise<void> {
  try {
    await SecureStore.setItemAsync(keyFor(ACCESS_PREFIX, host), tokens.accessToken, OPTIONS);
    if (tokens.refreshToken) {
      await SecureStore.setItemAsync(keyFor(REFRESH_PREFIX, host), tokens.refreshToken, OPTIONS);
    }
  } catch {
    // The session still works for this run; it just will not survive a restart.
  }
}

export async function clearTokens(host: string): Promise<void> {
  forgetFileAccess(host);
  try {
    await SecureStore.deleteItemAsync(keyFor(ACCESS_PREFIX, host), OPTIONS);
    await SecureStore.deleteItemAsync(keyFor(REFRESH_PREFIX, host), OPTIONS);
    await SecureStore.deleteItemAsync(keyFor(FILE_PREFIX, host), OPTIONS);
  } catch {
    // ignore
  }
}

/**
 * From `server:joined`, `token:refreshed` or `file:key`. Only an older server's file token is
 * kept on disk, since it sends no key when a session is restored (GRYT-1549).
 */
export async function applyFileAccess(host: string, grant: { fileKey?: unknown; fileToken?: string }): Promise<void> {
  const took = holdFileAccess(host, grant);
  try {
    if (took === "key") await SecureStore.deleteItemAsync(keyFor(FILE_PREFIX, host), OPTIONS);
    if (took === "token" && grant.fileToken) await SecureStore.setItemAsync(keyFor(FILE_PREFIX, host), grant.fileToken, OPTIONS);
  } catch {
    // Pictures still load for this run; an older server's just won't survive a restart.
  }
}

/** After the socket's proof, and never before: an older server's stored token, if that is all there is. */
export async function restoreFileToken(host: string): Promise<void> {
  if (hasFileAccess(host)) return;
  try {
    const token = await SecureStore.getItemAsync(keyFor(FILE_PREFIX, host), OPTIONS);
    if (token && !hasFileAccess(host)) holdFileAccess(host, { fileToken: token });
  } catch {
    // Nothing stored that can be read, so there is nothing to restore.
  }
}
