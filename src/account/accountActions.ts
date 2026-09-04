/**
 * What the account actions are, and which of them ends the session. Its own
 * module with no React Native in it, so a test can import it — `useAccount`
 * pulls in react-native, whose Flow syntax vitest cannot parse.
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
 * Whether finishing this action leaves nothing to be signed in to. **Only
 * deletion does** — the round trip issues fresh tokens whatever the action was,
 * and after `delete_account` those name somebody who no longer exists.
 *
 * Everything else is the opposite mistake: signing somebody out for changing a
 * password is a bug, not caution.
 */
export function actionEndsSession(action: string): boolean {
  return action === ACCOUNT_ACTIONS.deleteAccount;
}
