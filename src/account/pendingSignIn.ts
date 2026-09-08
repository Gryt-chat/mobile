/**
 * The half of a sign-in that has to outlive the process: Android can replace the app
 * while the browser is in front of it. In SecureStore beside the tokens, **single use
 * and short lived**. **Nothing native is imported here**, so the decision is testable.
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
 * Whether a callback belongs to this pending sign-in. Separated from the storage, and
 * it is the part worth being sure about: `state` is what stops a handed-over code.
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
