import * as SecureStore from "expo-secure-store";

import type { PendingSignIn } from "./pendingSignIn";

/**
 * The account session, kept where the per-server tokens are: **an access token
 * is a bearer credential, and anything holding it is you until it expires.**
 * One account per device, so there is nothing to key on.
 */

const ACCESS = "gryt.account.access";
const PENDING = "gryt.account.pending-signin";
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

/* ── The sign-in that is still in flight ───────────────────────────────── */

/**
 * The PKCE verifier and state, for as long as a sign-in is open. Here rather
 * than beside the decision, because importing `expo-secure-store` there would
 * take `react-native` with it and put the decision out of reach of the tests.
 *
 * **In the keychain**: whoever holds a verifier and an intercepted code can
 * complete the exchange, which is what PKCE exists to stop.
 */
export async function writePendingSignIn(pending: PendingSignIn): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING, JSON.stringify(pending), OPTIONS);
  } catch {
    /* The in-process path still works; only the cold-start one is lost, which
       is where it was before this existed. */
  }
}

export async function readPendingSignIn(): Promise<PendingSignIn | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING, OPTIONS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSignIn;
    if (!parsed?.codeVerifier || !parsed?.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingSignIn(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING, OPTIONS);
  } catch {
    // ignore
  }
}
