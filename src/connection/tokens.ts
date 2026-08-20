import * as SecureStore from "expo-secure-store";

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
  try {
    await SecureStore.deleteItemAsync(keyFor(ACCESS_PREFIX, host), OPTIONS);
    await SecureStore.deleteItemAsync(keyFor(REFRESH_PREFIX, host), OPTIONS);
  } catch {
    // ignore
  }
}
