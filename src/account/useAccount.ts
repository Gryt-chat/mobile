import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import { actionEndsSession } from "./accountActions";
import { useCallback, useEffect, useRef, useState } from "react";

import { msUntilRefresh, shouldRefresh } from "../connection/expiry";
import { clearCertificate } from "./store";
import { accountConfig, discovery, discoveryFor, loadAuthOverride } from "./config";
import { profileFrom, type AccountProfile } from "./profile";
import {
  clearAccountTokens,
  readAccountTokens,
  writeAccountTokens,
  clearPendingSignIn,
  readPendingSignIn,
  writePendingSignIn,
  type AccountTokens,
} from "./tokens";
import { matchesPending } from "./pendingSignIn";

/**
 * Lets a redirect that reached this process finish the sign-in that started it.
 *
 * Documented as required by `expo-auth-session` and easy to leave out, because
 * on the happy path `promptAsync` resolves without it. It matters when the
 * browser hands the URL back through the app rather than through the auth
 * session — which is the case that was broken.
 */
WebBrowser.maybeCompleteAuthSession();

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
   * Finish a sign-in whose redirect came back as `gryt://auth/callback`.
   *
   * Only `app/auth/callback.tsx` calls this. Returns false when there was
   * nothing to finish, which is the ordinary case for a stale link.
   */
  completeSignIn: (params: { code?: string | null; state?: string | null }) => Promise<boolean>;
  /**
   * The account's access token, refreshed if it is due.
   *
   * Nothing needs this yet — it is what the identity service will want in
   * exchange for a certificate, which is the next piece. Exposed now because
   * the refresh logic belongs with the session rather than with whoever
   * eventually calls it.
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * Do one thing to the account at auth.gryt.chat, then come back.
   *
   * Takes a Keycloak required-action alias — `UPDATE_PASSWORD`,
   * `UPDATE_EMAIL`, `CONFIGURE_RECOVERY_AUTHN_CODES`, `delete_account`. Each
   * runs on the login pages, which carry the Gryt theme, so none of them lands
   * in the stock Keycloak account console.
   *
   * The action has to be registered and enabled on the realm. Keycloak ignores
   * one it does not recognise and completes the sign-in instead, so a missing
   * action looks like a button that does nothing.
   */
  runAccountAction: (action: string) => Promise<void>;
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
    /* The certificate goes with them. It is not a credential, but it names an
     * account this device is no longer signed in to, and leaving it would mean
     * the next join still presenting that identity. */
    await clearCertificate();
    setState({ status: "signedOut" });
  }, []);

  /** Swap a refresh token for a fresh access token, or give up the session. */
  const refresh = useCallback(async (): Promise<string | null> => {
    const held = tokens.current;
    if (!held?.refreshToken) return held?.accessToken ?? null;

    try {
      const result = await AuthSession.refreshAsync(
        { clientId: accountConfig().clientId, refreshToken: held.refreshToken },
        discovery(),
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
    /* The override first, then the session. A token restored against the
     * default issuer and refreshed against a custom one is a refresh that fails
     * for a reason nothing on screen explains. */
    void loadAuthOverride()
      .then(() => readAccountTokens())
      .then(async (held) => {
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

  /**
   * The authorize-and-exchange round trip, with an optional required action.
   * `kc_action` names a required action registered on the realm, which runs on
   * Gryt's own themed login pages. Signing in is the same flow with no action.
   *
   * **A disabled action fails quietly.** Keycloak ignores a `kc_action` it does
   * not recognise and completes the sign-in instead, so the button looks like
   * it did nothing — check the realm's required actions before reading this
   * file.
   */
  const runFlow = useCallback(async (kcAction?: string) => {
    setState({ status: "signingIn" });
    try {
      /* Read once and used for both halves of the exchange. Reading it twice
       * would let the override change between the authorize and the token
       * request, which is a code issued by one Keycloak being redeemed at
       * another. */
      const config = accountConfig();
      const endpoints = discoveryFor(config.issuer);

      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scopes: [...config.scopes],
        usePKCE: true,
        extraParams: kcAction ? { kc_action: kcAction } : undefined,
      });

      /* Written down *before* the browser opens, because after it opens this
         process may not be the one that comes back. `makeAuthUrlAsync` is what
         generates the verifier and the state, so there is nothing to record
         until it has run. */
      await request.makeAuthUrlAsync(endpoints);
      await writePendingSignIn({
        codeVerifier: request.codeVerifier ?? "",
        state: request.state,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        issuer: config.issuer,
        startedAt: Date.now(),
      });

      const result = await request.promptAsync(endpoints);

      if (result.type !== "success") {
        // Dismissing the browser is not a failure worth a red screen.
        await clearPendingSignIn();
        setState({ status: "signedOut" });
        return;
      }

      const exchanged = await AuthSession.exchangeCodeAsync(
        {
          clientId: config.clientId,
          code: result.params.code,
          redirectUri: config.redirectUri,
          extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
        },
        endpoints,
      );

      const next: AccountTokens = {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        idToken: exchanged.idToken,
      };
      await writeAccountTokens(next);
      await clearPendingSignIn();
      adopt(next);
      scheduleRefresh(next.accessToken);
    } catch (err) {
      await clearPendingSignIn();
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Could not sign in.",
      });
    }
  }, [adopt, scheduleRefresh]);

  /**
   * Finish a sign-in whose redirect arrived as a deep link.
   *
   * The other half of `runFlow`, for when the browser's redirect reached the
   * router instead of the waiting auth session — Android replaced the process
   * while the browser was in front of it, so the closure holding the verifier
   * is gone and only what `writePendingSignIn` wrote survives.
   *
   * Returns whether it got anywhere, so the callback screen can say something
   * rather than bouncing to a screen that still says signed out.
   */
  const completeSignIn = useCallback(
    async (params: { code?: string | null; state?: string | null }): Promise<boolean> => {
      const pending = await readPendingSignIn();
      const check = matchesPending(pending, params);
      if (!check.ok || !pending) {
        await clearPendingSignIn();
        /* Not an error state. Landing here with nothing pending is what a stale
           link in the browser's history does, and a red screen for that reads
           as a fault in the app. */
        setState((prev) => (prev.status === "signingIn" ? { status: "signedOut" } : prev));
        return false;
      }

      setState({ status: "signingIn" });
      try {
        const exchanged = await AuthSession.exchangeCodeAsync(
          {
            clientId: pending.clientId,
            code: params.code as string,
            redirectUri: pending.redirectUri,
            extraParams: { code_verifier: pending.codeVerifier },
          },
          discoveryFor(pending.issuer),
        );
        const next: AccountTokens = {
          accessToken: exchanged.accessToken,
          refreshToken: exchanged.refreshToken,
          idToken: exchanged.idToken,
        };
        await writeAccountTokens(next);
        await clearPendingSignIn();
        adopt(next);
        scheduleRefresh(next.accessToken);
        return true;
      } catch (err) {
        await clearPendingSignIn();
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not finish signing in.",
        });
        return false;
      }
    },
    [adopt, scheduleRefresh],
  );

  const signIn = useCallback(() => runFlow(), [runFlow]);

  /**
   * Send somebody out to do one thing to their own account.
   *
   * Comes back with fresh tokens, because the round trip issues them either
   * way — which also means the app is still signed in afterwards. Deleting the
   * account is the exception: Keycloak destroys the account and the tokens are
   * for somebody who no longer exists, so that one signs out on return rather
   * than adopting them.
   */
  const runAccountAction = useCallback(
    async (action: string) => {
      await runFlow(action);
      if (actionEndsSession(action)) await forget();
    },
    [runFlow, forget],
  );

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

  return { state, signIn, signOut, getAccessToken, runAccountAction, completeSignIn };
}
