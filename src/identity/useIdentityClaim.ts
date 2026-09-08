import { useCallback, useEffect, useState } from "react";

import { useGrytAccount } from "../account/AccountProvider";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { getClaimDecision, setClaimDecision } from "./identityClaims";
import { getGuestVisit } from "./guestHistory";
import { identityScopeFor } from "./scope";

/**
 * Claiming one server's guest membership for the account, from either direction. The
 * by-hand route is not a convenience: on a fresh device the person saying "I have used
 * this server before" *is* the consent, and the only source of it (GRYT-502).
 */
export function useIdentityClaim(host: string | null) {
  const { state } = useGrytAccount();
  const { rejoin } = useServerConnection();
  const signedIn = state.status === "signedIn";

  /** Null while it is still being read, so nothing flashes an offer. */
  const [decision, setDecision] = useState<"yes" | "no" | null | undefined>(undefined);
  const [wasGuest, setWasGuest] = useState(false);
  /** When that guest user last connected, for the prompt to show. */
  const [lastUsed, setLastUsed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!host) {
      setDecision(undefined);
      setWasGuest(false);
      setLastUsed(null);
      return;
    }
    const scope = identityScopeFor(host);
    void Promise.all([getClaimDecision(scope), getGuestVisit(scope)]).then(
      ([answered, visit]) => {
        if (cancelled) return;
        setDecision(answered);
        setWasGuest(visit !== null);
        setLastUsed(visit?.lastUsed ?? null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [host]);

  /**
   * Whether claiming is still on the table. **A previous "no" does not close it** — the
   * decision is read when a challenge is answered. A "yes" closes it.
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

  return { canClaim, shouldAsk, lastUsed, claim, decline };
}
