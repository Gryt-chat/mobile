import { useCallback, useEffect, useState } from "react";

import { useGrytAccount } from "../account/AccountProvider";
import { useServerConnection } from "../connection/ConnectionProvider";
import { getClaimDecision, setClaimDecision } from "./identityClaims";
import { hasGuestScope } from "./guestHistory";
import { identityScopeFor } from "./scope";

/**
 * Claiming one server's guest membership for the account, from either
 * direction.
 *
 * Two things reach this. The prompt asks on its own when the local guest
 * history says this device has been here before. The server menu offers it by
 * hand for the case the history cannot cover: a seed restored onto a device
 * that has never been to this server, where nothing local knows there is
 * anything to claim.
 *
 * That second route is not a convenience. The history is deliberately the only
 * way to know without asking the server, and asking the server means proving
 * the link, which is the disclosure itself. On a fresh device there is nothing
 * to go on — so the person saying "I have used this server before" *is* the
 * consent, and the only source of it.
 *
 * Ported from the desktop's `useIdentityClaim`. GRYT-285 there, GRYT-502 here.
 */
export function useIdentityClaim(host: string | null) {
  const { state } = useGrytAccount();
  const { rejoin } = useServerConnection();
  const signedIn = state.status === "signedIn";

  /** Null while it is still being read, so nothing flashes an offer. */
  const [decision, setDecision] = useState<"yes" | "no" | null | undefined>(undefined);
  const [wasGuest, setWasGuest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!host) {
      setDecision(undefined);
      setWasGuest(false);
      return;
    }
    const scope = identityScopeFor(host);
    void Promise.all([getClaimDecision(scope), hasGuestScope(scope)]).then(
      ([answered, guest]) => {
        if (cancelled) return;
        setDecision(answered);
        setWasGuest(guest);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [host]);

  /**
   * Whether claiming is still on the table here.
   *
   * A previous "no" does not close it. Somebody who declined and later thinks
   * better of it should not have to sign out to change their mind, and the
   * decision is only consulted when a challenge is answered, so revisiting it
   * costs nothing. An existing "yes" is the one that closes it: it has already
   * happened.
   */
  const canClaim = Boolean(signedIn && host && decision !== "yes" && decision !== undefined);

  /** Been here as a guest, and nobody has said either way yet. */
  const shouldAsk = Boolean(signedIn && host && wasGuest && decision === null);

  const claim = useCallback(async () => {
    if (!host) return;
    await setClaimDecision(identityScopeFor(host), "yes");
    setDecision("yes");
    await rejoin();
  }, [host, rejoin]);

  const decline = useCallback(async () => {
    if (!host) return;
    await setClaimDecision(identityScopeFor(host), "no");
    setDecision("no");
  }, [host]);

  return { canClaim, shouldAsk, claim, decline };
}
