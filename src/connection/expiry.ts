import { base64UrlDecode } from "../identity/encoding";

/**
 * When an access token stops being accepted.
 *
 * Read rather than trusted: this decodes the payload without verifying the
 * signature, which is fine for the only question being asked — *should I ask
 * for a new one yet* — and would not be fine for anything else. The server
 * checks the signature; a client lying to itself about `exp` only costs it a
 * pointless refresh.
 */
export function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(token.split(".")[1])),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Five minutes, matching the desktop client.
 *
 * An access token lasts fifteen, so this refreshes at two thirds through and
 * leaves room for a slow network and a clock that is a little out.
 */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Whether to ask for a new token now. */
export function shouldRefresh(token: string, now = Date.now()): boolean {
  const expiry = tokenExpiryMs(token);
  // A token whose expiry cannot be read is treated as due. Refreshing
  // needlessly costs one round trip; trusting an unreadable token costs a
  // session that dies mid-use.
  if (expiry === null) return true;
  return expiry - now < REFRESH_MARGIN_MS;
}

/**
 * How long to wait before refreshing, or null if it should happen now.
 *
 * Capped because `setTimeout` in React Native takes a 32-bit delay, and a
 * token with an absurd `exp` would otherwise wrap round to firing immediately
 * and in a loop.
 */
const MAX_TIMER_MS = 2_147_483_000;

export function msUntilRefresh(token: string, now = Date.now()): number | null {
  const expiry = tokenExpiryMs(token);
  if (expiry === null) return null;
  const delay = expiry - now - REFRESH_MARGIN_MS;
  if (delay <= 0) return null;
  return Math.min(delay, MAX_TIMER_MS);
}
