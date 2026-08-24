import { useEffect, useRef } from "react";

import { useServers } from "../servers/store";
import {
  clearAccountServers,
  listAccountServers,
  readAccountOwner,
  writeAccountOwner,
} from "./accountServers";
import { useGrytAccount } from "./AccountProvider";

/**
 * Leaves the servers that belonged to an account when this device stops being
 * that account.
 *
 * A membership made with an account belongs to that account. Leaving it behind
 * is how somebody signs out and stays signed in — the server session token is
 * still on disk, and `useConnection` presents it rather than joining again, so
 * the certificate never gets a say (GRYT-572).
 *
 * **Guest memberships survive.** They belong to the device, are derived from the
 * seed in the Keychain, and have nothing to do with any account.
 * `accountServers.ts` is what tells the two apart.
 *
 * ## The rule is "no longer that account", not "signed out"
 *
 * The first version watched for `signedIn → signedOut`, and that was wrong in a
 * way worth spelling out, because it destroyed data.
 *
 * Two different things produce that transition. `signOut()` is a person
 * deciding something. `refresh()` giving up on an expired refresh token is a
 * session quietly running out — and it calls the same `forget()`. So a phone
 * left alone long enough would come back, fail to refresh, and silently leave
 * every server the account had joined, with no undo and no invite to rejoin
 * with (GRYT-579).
 *
 * What is wanted is narrower: leave the previous account's servers when this
 * device stops being that account. That is a deliberate sign-out, or signing in
 * as a *different* subject. An expiry followed by signing back in as the same
 * person changes nothing, which is what anybody would expect from having been
 * asked to sign in again.
 *
 * Draws nothing. Mounted under `ServersProvider`, which is under
 * `AccountProvider`, because it needs both.
 */
export function LeaveOnSignOut() {
  const { state } = useGrytAccount();
  const { leave, ready } = useServers();

  /* One at a time. The work is async and the account state can change while it
   * runs — signing straight back in, most obviously. */
  const running = useRef(false);

  useEffect(() => {
    /* Waits for the list. Leaving against a list that has not loaded is a no-op
     * that would still clear the record of what to leave, so the whole thing
     * would silently do nothing. */
    if (!ready) return;
    /* `loading` and `signingIn` are on the way to an answer rather than answers.
     * Acting on them would leave servers every time the app started. */
    if (state.status !== "signedIn" && state.status !== "signedOut") return;
    if (running.current) return;

    const sub = state.status === "signedIn" ? state.profile.sub : null;

    void (async () => {
      running.current = true;
      try {
        const owner = await readAccountOwner();

        if (sub) {
          /* Signed in. Only interesting when it is somebody *else* — no owner
           * recorded is the ordinary first sign-in, and the same owner is the
           * ordinary everything-else. */
          if (!owner || owner === sub) {
            await writeAccountOwner(sub);
            return;
          }
        } else if (!owner) {
          /* Signed out with nothing recorded: a fresh install, or an expiry
           * after this has already done its work. Nothing to leave. */
          return;
        }

        /* Either the account changed, or it went away deliberately. Both mean
         * the previous account's memberships are no longer this device's. */
        const hosts = await listAccountServers();
        /* In order, and through `leave`, so each goes the same way as leaving by
         * hand: the entry is removed, its record is forgotten, and — the part
         * that matters — the server session token is cleared, which is what
         * makes it a real departure rather than a hidden row. */
        for (const host of hosts) await leave(host);
        await clearAccountServers();

        /* The new owner, after the old one's servers are gone rather than
         * before. A crash in between should look like the old account still
         * owns them, so the next launch finishes the job. */
        if (sub) await writeAccountOwner(sub);
      } finally {
        running.current = false;
      }
    })();
  }, [state, ready, leave]);

  return null;
}
