/**
 * What the account actions are, and which ends the session. Its own module with no
 * React Native in it, so a test can import it.
 */

/**
 * A Keycloak required-action alias, passed as `kc_action`. Each has to be registered
 * and enabled on the realm, or a missing action looks like a dead button.
 */
export const ACCOUNT_ACTIONS = {
  password: "UPDATE_PASSWORD",
  email: "UPDATE_EMAIL",
  recoveryCodes: "CONFIGURE_RECOVERY_AUTHN_CODES",
  deleteAccount: "delete_account",
} as const;

export type AccountAction = (typeof ACCOUNT_ACTIONS)[keyof typeof ACCOUNT_ACTIONS];

/**
 * Whether finishing this action leaves nothing to be signed in to. **Only deletion
 * does** — the round trip issues fresh tokens whatever the action was.
 */
export function actionEndsSession(action: string): boolean {
  return action === ACCOUNT_ACTIONS.deleteAccount;
}
