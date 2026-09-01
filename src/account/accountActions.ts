/**
 * What the account actions are, and which of them ends the session.
 *
 * Its own module with no React Native in it, so a test can import it. Anything
 * reaching into `useAccount` pulls in expo-auth-session and then react-native,
 * whose Flow syntax vitest cannot parse — which is why every other tested
 * module in here is pure as well.
 */

/**
 * A Keycloak required-action alias, passed as `kc_action`.
 *
 * Each has to be registered and enabled on the realm. Keycloak ignores one it
 * does not recognise and completes the sign-in instead, so a missing action
 * looks like a button that does nothing rather than an error.
 */
export const ACCOUNT_ACTIONS = {
  password: "UPDATE_PASSWORD",
  email: "UPDATE_EMAIL",
  recoveryCodes: "CONFIGURE_RECOVERY_AUTHN_CODES",
  deleteAccount: "delete_account",
} as const;

export type AccountAction = (typeof ACCOUNT_ACTIONS)[keyof typeof ACCOUNT_ACTIONS];

/**
 * Whether finishing this action leaves nothing to be signed in to.
 *
 * Only deletion does. The round trip issues fresh tokens whatever the action
 * was, and after `delete_account` those name somebody Keycloak has just
 * removed — so the app would sit signed in as a user who no longer exists, and
 * the first request to use the token would fail somewhere far from the cause.
 *
 * Everything else is the opposite mistake: signing somebody out because they
 * changed their password is a bug, not caution.
 */
export function actionEndsSession(action: string): boolean {
  return action === ACCOUNT_ACTIONS.deleteAccount;
}
