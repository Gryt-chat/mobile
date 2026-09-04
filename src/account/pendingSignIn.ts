/**
 * The half of a sign-in that has to outlive the process. Android can replace
 * the app while the browser is in front of it, and the redirect then arrives as
 * a fresh deep link into a process that has never heard of the sign-in — the
 * PKCE verifier included. The symptom is the router's "Unmatched Route" screen
 * rather than anything about signing in.
 *
 * In SecureStore beside the tokens, because a verifier is the secret half of
 * PKCE. **Single use and short lived**: cleared on success, on failure, and on
 * anything older than `PENDING_MAX_AGE_MS`.
 *
 * **Nothing native is imported here.** `expo-secure-store` pulls in
 * `react-native`, whose Flow syntax vitest cannot parse, so a decision in the
 * same file as the keychain call is a decision with no test.
 */

/**
 * Ten minutes. Longer than any sign-in takes and shorter than a code lives, so
 * a record this old is debris rather than a flow somebody is still in.
 */
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

export interface PendingSignIn {
  /** The PKCE verifier. The secret half — see the note above. */
  codeVerifier: string;
  /** What was sent as `state`, to be compared with what comes back. */
  state: string;
  clientId: string;
  redirectUri: string;
  /** Which Keycloak issued the code. The override can be changed mid-flow. */
  issuer: string;
  startedAt: number;
}

/**
 * Whether a callback belongs to this pending sign-in.
 *
 * Separated from the storage so the decision can be tested without a keychain,
 * and because it is the part that is worth being sure about: `state` is what
 * stops somebody handing the app a code they obtained elsewhere.
 */
export function matchesPending(
  pending: PendingSignIn | null,
  params: { state?: string | null; code?: string | null },
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!pending) return { ok: false, reason: "no sign-in was in progress" };
  if (!params.code) return { ok: false, reason: "the callback carried no code" };
  if (!params.state) return { ok: false, reason: "the callback carried no state" };
  if (params.state !== pending.state) {
    return { ok: false, reason: "the callback's state does not match the one sent" };
  }
  if (now - pending.startedAt > PENDING_MAX_AGE_MS) {
    return { ok: false, reason: "the sign-in took too long and has expired" };
  }
  return { ok: true };
}
