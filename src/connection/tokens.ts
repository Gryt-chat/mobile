import * as SecureStore from "expo-secure-store";

import { forgetFileToken, setFileToken } from "./fileToken";

/**
 * The tokens a join hands back, kept so the next launch does not start over.
 *
 * In the Keychain rather than beside the server list, because these are bearer
 * credentials: anything holding the access token is the member it names until
 * it expires. The desktop client keeps them in `localStorage`, which is the
 * best a browser offers; a phone can do better, so it does.
 *
 * Keyed per host. One membership per server, and a token from one is worthless
 * at another — the server checks `serverHost` inside it.
 */

const ACCESS_PREFIX = "gryt.token.access.";
const REFRESH_PREFIX = "gryt.token.refresh.";
const FILE_PREFIX = "gryt.token.file.";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * SecureStore keys may only contain alphanumerics, `.`, `-` and `_`, and a host
 * carries a colon whenever it names a port. Hex rather than base64url, because
 * the latter is not in that set either.
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
  /** Reads uploads on this server and nothing else. GRYT-740. */
  fileToken?: string;
}

export async function readTokens(host: string): Promise<StoredTokens | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(keyFor(ACCESS_PREFIX, host), OPTIONS);
    if (!accessToken) return null;
    const refreshToken = await SecureStore.getItemAsync(keyFor(REFRESH_PREFIX, host), OPTIONS);
    const fileToken = await SecureStore.getItemAsync(keyFor(FILE_PREFIX, host), OPTIONS);
    // Into the synchronous map on the way past, so a restored session can draw
    // pictures before anything else has had to think about it.
    setFileToken(host, fileToken ?? undefined);
    return { accessToken, refreshToken: refreshToken ?? undefined, fileToken: fileToken ?? undefined };
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
    if (tokens.fileToken) {
      setFileToken(host, tokens.fileToken);
      await SecureStore.setItemAsync(keyFor(FILE_PREFIX, host), tokens.fileToken, OPTIONS);
    }
  } catch {
    // The session still works for this run; it just will not survive a restart.
  }
}

export async function clearTokens(host: string): Promise<void> {
  forgetFileToken(host);
  try {
    await SecureStore.deleteItemAsync(keyFor(ACCESS_PREFIX, host), OPTIONS);
    await SecureStore.deleteItemAsync(keyFor(REFRESH_PREFIX, host), OPTIONS);
    await SecureStore.deleteItemAsync(keyFor(FILE_PREFIX, host), OPTIONS);
  } catch {
    // ignore
  }
}

export { getFileToken, setFileToken, forgetFileToken } from "./fileToken";
