import * as SecureStore from "expo-secure-store";

/**
 * The account session, kept where the per-server tokens are kept and for the
 * same reason: an access token is a bearer credential, and anything holding it
 * is you until it expires.
 *
 * One account per device. Unlike server tokens there is nothing to key on —
 * a second account would mean a second everything, and no screen offers that.
 */

const ACCESS = "gryt.account.access";
const REFRESH = "gryt.account.refresh";
const ID = "gryt.account.id";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface AccountTokens {
  accessToken: string;
  refreshToken?: string;
  /** Kept for the logout redirect, which Keycloak wants an id token hint for. */
  idToken?: string;
}

export async function readAccountTokens(): Promise<AccountTokens | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(ACCESS, OPTIONS);
    if (!accessToken) return null;
    const refreshToken = await SecureStore.getItemAsync(REFRESH, OPTIONS);
    const idToken = await SecureStore.getItemAsync(ID, OPTIONS);
    return {
      accessToken,
      refreshToken: refreshToken ?? undefined,
      idToken: idToken ?? undefined,
    };
  } catch {
    // Unreadable storage means signed out, which costs a sign-in rather than
    // an error nobody can act on.
    return null;
  }
}

export async function writeAccountTokens(tokens: AccountTokens): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACCESS, tokens.accessToken, OPTIONS);
    if (tokens.refreshToken) await SecureStore.setItemAsync(REFRESH, tokens.refreshToken, OPTIONS);
    if (tokens.idToken) await SecureStore.setItemAsync(ID, tokens.idToken, OPTIONS);
  } catch {
    // The session works for this run; it just will not survive a restart.
  }
}

export async function clearAccountTokens(): Promise<void> {
  for (const key of [ACCESS, REFRESH, ID]) {
    try {
      await SecureStore.deleteItemAsync(key, OPTIONS);
    } catch {
      // ignore
    }
  }
}
