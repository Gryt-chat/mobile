import type { IdentityTier } from "./types";

/* Which identity to present, and what to say when neither will do. Separate because the
 * cases are real: signed in or not, crossed with what the server admits, or never said. */

export type TierChoice =
  | { tier: "account" }
  | { tier: "local" }
  | { refuse: string; code: string };

/**
 * Prefer the account when there is one and the server takes it; fall back to local, since
 * the same device key is behind both. A missing `identityTiers` is old, not permissive.
 */
export function chooseTier({
  tiers,
  signedIn,
}: {
  tiers: IdentityTier[] | undefined;
  signedIn: boolean;
}): TierChoice {
  if (!tiers) {
    return signedIn
      ? { tier: "account" }
      : {
          refuse: "This server is too old to accept a guest identity. Sign in to a Gryt account to join it.",
          code: "account_required",
        };
  }

  if (signedIn && tiers.includes("account")) return { tier: "account" };
  if (tiers.includes("local")) return { tier: "local" };

  return {
    refuse: tiers.includes("account")
      ? "This server requires a Gryt account. Sign in from the You tab and try again."
      : "This server does not accept any identity this app can offer.",
    code: "account_required",
  };
}
