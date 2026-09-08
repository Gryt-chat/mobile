import { decodeToken } from "./claims";

/**
 * When an access token stops being accepted. **Read rather than trusted**, which is
 * fine for the only question asked: lying to itself costs a pointless refresh.
 */
export function tokenExpiryMs(token: string): number | null {
  const claims = decodeToken(token);
  return typeof claims?.exp === "number" ? claims.exp * 1000 : null;
}

/**
 * Five minutes, matching the desktop client. An access token lasts fifteen, so this
 * refreshes two thirds through and leaves room for a slow network.
 */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Whether to ask for a new token now. */
export function shouldRefresh(token: string, now = Date.now()): boolean {
  const expiry = tokenExpiryMs(token);
  // A token whose expiry cannot be read is treated as due: refreshing needlessly costs
  // a round trip, and trusting an unreadable token costs a session mid-use.
  if (expiry === null) return true;
  return expiry - now < REFRESH_MARGIN_MS;
}

/**
 * How long to wait before refreshing, or null if it should happen now. Capped, because
 * `setTimeout` takes a 32-bit delay and an absurd `exp` would wrap round.
 */
const MAX_TIMER_MS = 2_147_483_000;

export function msUntilRefresh(token: string, now = Date.now()): number | null {
  const expiry = tokenExpiryMs(token);
  if (expiry === null) return null;
  const delay = expiry - now - REFRESH_MARGIN_MS;
  if (delay <= 0) return null;
  return Math.min(delay, MAX_TIMER_MS);
}
