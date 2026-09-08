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
 * **Easy to leave out**, because `promptAsync` resolves without it on the happy path.
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
   * Finish a sign-in whose redirect came back as `gryt://auth/callback`. Returns
   * false when there was nothing to finish, which a stale link produces.
   */
  completeSignIn: (params: { code?: string | null; state?: string | null }) => Promise<boolean>;
  /**
   * The account's access token, refreshed if due — what the identity service wants
   * in exchange for a certificate.
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * Do one thing to the account at auth.gryt.chat, then come back. **The action has
   * to be registered and enabled on the realm**, or the button looks dead.
   */
  runAccountAction: (action: string) => Promise<void>;
}

/**
 * A Gryt account on the phone: authorization code with PKCE against the realm the
 * desktop uses. **This does not replace the device identity.**
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
    /* The certificate goes with them. It names an account this device is no longer
     * signed in to, and the next join would still present it. */
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
      /* A refresh token Keycloak will not take back is the end of the session.
       * Keeping it means retrying forever and looking broken. */
      await forget();
      return null;
    }
  }, [adopt, forget]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  /**
   * Refresh shortly before the token stops working. A timer, **and a backgrounded
   * phone does not run these**, which is why `getAccessToken` checks too.
   */
  const scheduleRefresh = useCallback((accessToken: string) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const delay = msUntilRefresh(accessToken);
    refreshTimer.current = setTimeout(() => void refreshRef.current(), delay ?? 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    /* The override first, then the session: a token restored against the default
     * issuer and refreshed against a custom one fails inexplicably. */
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
   * **A disabled action fails quietly** — check the realm before reading this file.
   */
  const runFlow = useCallback(async (kcAction?: string) => {
    setState({ status: "signingIn" });
    try {
      /* Read once and used for both halves: reading it twice lets the override
       * change between the authorize and the token request. */
      const config = accountConfig();
      const endpoints = discoveryFor(config.issuer);

      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scopes: [...config.scopes],
        usePKCE: true,
        extraParams: kcAction ? { kc_action: kcAction } : undefined,
      });

      /* Written down *before* the browser opens, because afterwards this process
         may not be the one that comes back. */
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
   * Finish a sign-in whose redirect arrived as a deep link — Android may have
   * replaced the process, so only what `writePendingSignIn` wrote survives.
   */
  const completeSignIn = useCallback(
    async (params: { code?: string | null; state?: string | null }): Promise<boolean> => {
      const pending = await readPendingSignIn();
      const check = matchesPending(pending, params);
      if (!check.ok || !pending) {
        await clearPendingSignIn();
        /* Not an error state: landing here with nothing pending is what a stale
           link in the browser's history does. */
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
   * Send somebody out to do one thing to their own account. Comes back with fresh
   * tokens — except deleting the account, which signs out instead.
   */
  const runAccountAction = useCallback(
    async (action: string) => {
      await runFlow(action);
      if (actionEndsSession(action)) await forget();
    },
    [runFlow, forget],
  );

  const signOut = useCallback(async () => {
    /* Local only, deliberately. Ending the Keycloak session would send the reader
     * back out to a browser, and the tokens here are gone either way. */
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
