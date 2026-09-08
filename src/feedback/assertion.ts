import * as Crypto from "expo-crypto";

import { deriveLocalKeyPair, signJwt } from "../identity/keys";
import { getOrCreateSeed } from "../identity/seed";
import { assertionClaims, REPORTS_SCOPE } from "./claims";

/**
 * Proving a report came from a real Gryt install without saying which one. A key derived
 * for this service alone, not a per-server guest key, and bound to the bytes by `bh`.
 */
export async function signReport(body: string): Promise<string | null> {
  try {
    const seed = await getOrCreateSeed();
    const { privateKey, publicJwk } = deriveLocalKeyPair(seed, REPORTS_SCOPE);
    const claims = assertionClaims(publicJwk, body, Crypto.randomUUID());

    /* The public half travels in the protected header, which is how the
     * service verifies a key it has never seen — `jose`'s `EmbeddedJWK`. */
    return signJwt(claims as unknown as Record<string, unknown>, privateKey, {
      jwk: publicJwk,
    });
  } catch {
    /* Null rather than throwing: the signature is optional at the service, so a Keychain
     * that will not open should cost the signature and not the report. */
    return null;
  }
}
