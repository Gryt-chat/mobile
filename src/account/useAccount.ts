import * as AuthSession from "expo-auth-session";
import { useCallback, useEffect, useRef, useState } from "react";

import { msUntilRefresh, shouldRefresh } from "../connection/expiry";
import { ACCOUNT, DISCOVERY } from "./config";
import { profileFrom, type AccountProfile } from "./profile";
import {
  clearAccountTokens,
  readAccountTokens,
  writeAccountTokens,
  type AccountTokens,
} from "./tokens";

export type AccountState =
  /** Still reading the Keychain. Distinct from signed out, which flashes a sign-in button. */
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signingIn" }
  | { status: "signedIn"; profile: AccountProfile }
  | { status: "error"; message: string };

export interface Account {
  state: AccountState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * The account's access token, refreshed if it is due.
   *
   * Nothing needs this yet — it is what the identity service will want in
   * exchange for a certificate, which is the next piece. Exposed now because
   * the refresh logic belongs with the session rather than with whoever
   * eventually calls it.
   */
  getAccessToken: () => Promise<string | null>;
}

/**
 * A Gryt account on the phone.
 *
 * Authorization code with PKCE against the same realm and public client the
 * desktop client uses. `keycloak-js` is browser-only, so none of that code is
 * shared — but the realm, the client id and the redirect are, and the redirect
 * was already whitelisted.
 *
 * **This does not replace the device identity.** The P-256 key in the Keychain
 * is what joins servers, signed in or not; an account is a second thing the
 * device knows about itself. Conflating them would make signing out destroy
 * memberships, and it is the distinction the linking work depends on.
 */
export function useAccount(): Account {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const tokens = useRef<AccountTokens | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = useCallback((next: AccountTokens) => {
    tokens.current = next;
    // The id token carries the friendly claims; the access token always has a
    // subject, so it is the fallback rather than the first choice.
    const profile = (next.idToken && profileFrom(next.idToken)) || profileFrom(next.accessToken);
    setState(profile ? { status: "signedIn", profile } : { status: "signedOut" });
  }, []);

  const forget = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    tokens.current = null;
    await clearAccountTokens();
    setState({ status: "signedOut" });
  }, []);

  /** Swap a refresh token for a fresh access token, or give up the session. */
  const refresh = useCallback(async (): Promise<string | null> => {
    const held = tokens.current;
    if (!held?.refreshToken) return held?.accessToken ?? null;

    try {
      const result = await AuthSession.refreshAsync(
        { clientId: ACCOUNT.clientId, refreshToken: held.refreshToken },
        DISCOVERY,
      );
      const next: AccountTokens = {
        accessToken: result.accessToken,
        // Keycloak rotates refresh tokens, and dropping the new one leaves the
        // session alive exactly until the old one is refused.
        refreshToken: result.refreshToken ?? held.refreshToken,
        idToken: result.idToken ?? held.idToken,
      };
      await writeAccountTokens(next);
      adopt(next);
      return next.accessToken;
    } catch {
      /* A refresh token Keycloak will not take back is the end of the session
       * — it has expired, been revoked, or the account is gone. Keeping it
       * would mean retrying forever and looking broken rather than signed
       * out. */
      await forget();
      return null;
    }
  }, [adopt, forget]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  /**
   * Refresh shortly before the token stops working.
   *
   * A timer rather than a check on use, for the same reason the server session
   * has one: nothing polls, so there is no natural moment to notice. A
   * backgrounded phone does not run these, which is why `getAccessToken`
   * checks as well.
   */
  const scheduleRefresh = useCallback((accessToken: string) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const delay = msUntilRefresh(accessToken);
    refreshTimer.current = setTimeout(() => void refreshRef.current(), delay ?? 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readAccountTokens().then(async (held) => {
      if (cancelled) return;
      if (!held) {
        setState({ status: "signedOut" });
        return;
      }
      adopt(held);
      if (shouldRefresh(held.accessToken)) {
        const fresh = await refreshRef.current();
        if (fresh && !cancelled) scheduleRefresh(fresh);
      } else {
        scheduleRefresh(held.accessToken);
      }
    });
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [adopt, scheduleRefresh]);

  const signIn = useCallback(async () => {
    setState({ status: "signingIn" });
    try {
      const request = new AuthSession.AuthRequest({
        clientId: ACCOUNT.clientId,
        redirectUri: ACCOUNT.redirectUri,
        scopes: [...ACCOUNT.scopes],
        usePKCE: true,
      });

      const result = await request.promptAsync(DISCOVERY);

      if (result.type !== "success") {
        // Dismissing the browser is not a failure worth a red screen.
        setState({ status: "signedOut" });
        return;
      }

      const exchanged = await AuthSession.exchangeCodeAsync(
        {
          clientId: ACCOUNT.clientId,
          code: result.params.code,
          redirectUri: ACCOUNT.redirectUri,
          extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
        },
        DISCOVERY,
      );

      const next: AccountTokens = {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        idToken: exchanged.idToken,
      };
      await writeAccountTokens(next);
      adopt(next);
      scheduleRefresh(next.accessToken);
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Could not sign in.",
      });
    }
  }, [adopt, scheduleRefresh]);

  const signOut = useCallback(async () => {
    /* Local only, deliberately. Ending the Keycloak session as well would send
     * the reader back out to a browser to finish signing out of an app they
     * have already left, and the tokens this device holds are gone either way.
     * A shared-device story would want the round trip; a phone does not. */
    await forget();
  }, [forget]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const held = tokens.current;
    if (!held) return null;
    if (!shouldRefresh(held.accessToken)) return held.accessToken;
    return refreshRef.current();
  }, []);

  return { state, signIn, signOut, getAccessToken };
}
