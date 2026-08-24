import { useEffect, useRef } from "react";

import { useServers } from "../servers/store";
import { clearAccountServers, listAccountServers } from "./accountServers";
import { useGrytAccount } from "./AccountProvider";

/**
 * Leaves every server you joined *with the account* when you sign out of it.
 *
 * Signing out cleared the tokens and the certificate and stopped there, so the
 * servers stayed in the list and you stayed a member of them. Signing in as
 * somebody else did not help: the membership already existed, and the device
 * key that answers the join challenge is the same one either way — so the
 * server carried on calling you by the first account's name (GRYT-572).
 *
 * **Guest memberships survive.** They belong to the device rather than to any
 * account, are derived from the seed in the Keychain, and have nothing to do
 * with who is signed in. `accountServers.ts` is what tells the two apart, and
 * it exists because nothing else can.
 *
 * ## Why a component rather than something inside `signOut`
 *
 * `useAccount` owns tokens and knows nothing about servers, and it should stay
 * that way — it is used by things that have no server list. Putting the rule
 * here also means it applies to *every* way of signing out, including the one
 * in `AuthServerScreen` that happens as a side effect of changing the auth
 * server. A rule that has to be remembered at each call site is a rule that
 * will be missed at the next one.
 *
 * Draws nothing. Mounted under `ServersProvider`, which is under
 * `AccountProvider`, because it needs both.
 */
export function LeaveOnSignOut() {
  const { state } = useGrytAccount();
  const { leave, ready } = useServers();

  /**
   * What the status was last time, so this reacts to the *transition*.
   *
   * Signed out is the ordinary state on a first launch, and acting on the state
   * rather than the change would mean a fresh install leaving every server it
   * had just been given. Starting at whatever the first render says is what
   * makes the first render not a transition.
   */
  const previous = useRef<string | null>(null);

  useEffect(() => {
    /* Waits for the list. Leaving against a list that has not loaded is a
     * no-op that still clears the record of which servers to leave, so the
     * sign-out would silently do nothing at all. */
    if (!ready) return;

    const was = previous.current;
    previous.current = state.status;

    if (was === null) return;
    if (!(was === "signedIn" && state.status === "signedOut")) return;

    void (async () => {
      const hosts = await listAccountServers();
      /* In order, and through `leave`, so each one goes through the same path
       * as leaving by hand: the entry is removed, the record is forgotten, and
       * anything else watching the server list sees it happen once per server
       * rather than as a single unexplained emptying. */
      for (const host of hosts) await leave(host);
      /* Belt and braces. `leave` forgets each host as it goes, so this only
       * catches a host that was in the record and not in the list. */
      await clearAccountServers();
    })();
  }, [state.status, ready, leave]);

  return null;
}
