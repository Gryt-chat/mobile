/**
 * The half of a sign-in that has to outlive the process.
 *
 * `promptAsync` normally hands the redirect straight back, and none of this is
 * touched. What it cannot survive is Android replacing the app while the
 * browser is in front of it: the redirect then arrives as a fresh
 * `gryt://auth/callback` deep link into a process that has never heard of the
 * sign-in, and everything the code exchange needs — the PKCE verifier above
 * all — lived in a closure that is gone.
 *
 * That is what a tester hit on 2026-09-02, and the symptom is the router's
 * "Unmatched Route" screen rather than anything about signing in.
 *
 * So the verifier is written down before the browser opens and read back by the
 * callback route. Held in SecureStore beside the tokens, because a verifier is
 * the secret half of PKCE: whoever has it and an intercepted code can complete
 * the exchange, which is the whole thing PKCE exists to stop.
 *
 * **It is single use and short lived.** Cleared on success, on failure, and on
 * anything older than `PENDING_MAX_AGE_MS` — an authorization code is dead
 * within minutes anyway, and a verifier left behind is a secret kept for no
 * reason.
 *
 * **Nothing native is imported here.** The reading and writing live in
 * `tokens.ts` with the other account secrets, the same way `authServer.ts`
 * holds decisions and `config.ts` holds the storage around them. It is not
 * tidiness: `expo-secure-store` pulls in `react-native`, whose Flow syntax
 * vitest cannot parse, so a decision in the same file as the keychain call is
 * a decision with no test.
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
