import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Whether an account may take over the guest membership this device holds on a
 * particular server.
 *
 * **Per server, and unanswered means no.** Both halves matter, and both are the
 * desktop's, arrived at by replacing the thing this app does today.
 *
 * The device-wide version was a single question asked once after signing in,
 * whose yes authorised every guest identity on the machine at once — including
 * servers joined afterwards, which nobody had been asked about at all. The
 * decision genuinely differs per server: somebody may want their own community
 * carried onto their account and a server they were a guest on once left
 * exactly as it is. One answer cannot say that.
 *
 * Unanswered means no because signing the proof tells the server the account
 * and the guest are the same person, and no later decision can take that back.
 * An unanswered server is one nobody has agreed to link, so nothing is sent.
 *
 * Ported from the desktop's `identity-claims.ts`. GRYT-285.
 */

const KEY = "identityClaims";

export type ClaimDecision = "yes" | "no";

type Claims = Record<string, ClaimDecision>;

/** Anything that is not a decision is not one. Unreadable is unanswered. */
export function parseClaims(raw: unknown): Claims {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Claims = {};
  for (const [scope, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === "yes" || value === "no") out[scope] = value;
  }
  return out;
}

async function read(): Promise<Claims> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? parseClaims(JSON.parse(raw)) : {};
  } catch {
    /* Failing closed is the right direction for this one: nothing is proved to
     * anybody, and the cost is being asked again. */
    return {};
  }
}

/** What was decided for this scope, or null if nobody has been asked. */
export async function getClaimDecision(scope: string): Promise<ClaimDecision | null> {
  return (await read())[scope] ?? null;
}

/** Whether the link proof may be signed for this scope. Only an explicit yes. */
export async function mayClaim(scope: string): Promise<boolean> {
  return (await getClaimDecision(scope)) === "yes";
}

export async function setClaimDecision(
  scope: string,
  decision: ClaimDecision,
): Promise<void> {
  if (!scope) return;
  const claims = await read();
  if (claims[scope] === decision) return;
  claims[scope] = decision;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(claims));
  } catch {
    // The cost is being asked again, which is the safe way to be wrong.
  }
}
