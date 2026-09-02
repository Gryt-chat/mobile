import { describe, expect, it } from "vitest";

import { matchesPending, PENDING_MAX_AGE_MS, type PendingSignIn } from "./pendingSignIn";

/**
 * Whether a callback belongs to the sign-in that is waiting.
 *
 * The storage around this is a keychain call and not worth a fake. This is the
 * decision, and it is the one that matters: `state` is what stops the app
 * finishing a sign-in with a code it was handed rather than one it asked for,
 * and every other branch here ends in "send them back" rather than in a red
 * screen — landing on the callback with nothing pending is what a stale link
 * in the browser's history does, not a fault.
 */

const NOW = 1_800_000_000_000;

const pending = (over: Partial<PendingSignIn> = {}): PendingSignIn => ({
  codeVerifier: "verifier",
  state: "the-state",
  clientId: "gryt-web",
  redirectUri: "gryt://auth/callback",
  issuer: "https://auth.gryt.chat/realms/gryt",
  startedAt: NOW,
  ...over,
});

describe("matchesPending", () => {
  it("accepts the callback for the sign-in that is waiting", () => {
    const result = matchesPending(pending(), { code: "abc", state: "the-state" }, NOW + 5_000);
    expect(result.ok).toBe(true);
  });

  it("refuses when nothing was pending", () => {
    expect(matchesPending(null, { code: "abc", state: "the-state" }, NOW)).toEqual({
      ok: false,
      reason: "no sign-in was in progress",
    });
  });

  /*
   * The one that is security rather than housekeeping. Without it the app would
   * exchange a code somebody else obtained, against its own verifier, and end
   * up signed in as whoever that code belongs to.
   */
  it("refuses a state that is not the one it sent", () => {
    const result = matchesPending(pending(), { code: "abc", state: "somebody-elses" }, NOW);
    expect(result).toEqual({
      ok: false,
      reason: "the callback's state does not match the one sent",
    });
  });

  it("refuses a callback with no state at all", () => {
    expect(matchesPending(pending(), { code: "abc" }, NOW).ok).toBe(false);
    expect(matchesPending(pending(), { code: "abc", state: null }, NOW).ok).toBe(false);
  });

  it("refuses a callback with no code", () => {
    expect(matchesPending(pending(), { state: "the-state" }, NOW)).toEqual({
      ok: false,
      reason: "the callback carried no code",
    });
  });

  /* An authorization code is dead within minutes, so a record older than this
     is debris. Exchanging against it fails at Keycloak with a message about the
     code rather than about the wait, which is the confusing way round. */
  it("refuses a pending sign-in that has gone stale", () => {
    const justInside = matchesPending(
      pending(),
      { code: "abc", state: "the-state" },
      NOW + PENDING_MAX_AGE_MS,
    );
    expect(justInside.ok).toBe(true);

    const justPast = matchesPending(
      pending(),
      { code: "abc", state: "the-state" },
      NOW + PENDING_MAX_AGE_MS + 1,
    );
    expect(justPast).toEqual({
      ok: false,
      reason: "the sign-in took too long and has expired",
    });
  });
});
