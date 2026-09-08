import type { IdentityTier } from "./types";

/* Which identity to present, and what to say when neither will do. Pure and separate,
 * because it is the part with real cases in it: signed in or not, crossed with what the
 * server admits, crossed with a server too old to have said. */

export type TierChoice =
  | { tier: "account" }
  | { tier: "local" }
  | { refuse: string; code: string };

/**
 * Prefer the account when there is one and the server takes it — an account means the
 * same thing everywhere. Falling back to local is better than refusing: the same device
 * key is behind both. A missing `identityTiers` is older than the choice, not permissive.
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
