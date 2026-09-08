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
 * Leaves the servers that belonged to an account when this device stops being it.
 * **Guest memberships survive**, and **the rule is not "signed out"** (GRYT-579).
 */
export function LeaveOnSignOut() {
  const { state } = useGrytAccount();
  const { leave, ready } = useServers();

  /* One at a time. The work is async and the account state can change while it
   * runs — signing straight back in, most obviously. */
  const running = useRef(false);

  useEffect(() => {
    /* Waits for the list: leaving against one that has not loaded is a no-op that
     * would still clear the record of what to leave. */
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
           * recorded is the ordinary first sign-in. */
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
        /* In order, and through `leave`, so each goes the same way as leaving by hand
         * — including clearing the server session token. */
        for (const host of hosts) await leave(host);
        await clearAccountServers();

        /* The new owner, after the old one's servers are gone. A crash in between
         * should look like the old account still owns them. */
        if (sub) await writeAccountOwner(sub);
      } finally {
        running.current = false;
      }
    })();
  }, [state, ready, leave]);

  return null;
}
