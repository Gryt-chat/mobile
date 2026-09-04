import * as Crypto from "expo-crypto";

import { deriveLocalKeyPair, signJwt } from "../identity/keys";
import { getOrCreateSeed } from "../identity/seed";
import { assertionClaims, REPORTS_SCOPE } from "./claims";

/**
 * Proving a report came from a real Gryt install, without saying which one.
 *
 * The app key in the header is friction rather than authentication — the
 * service says so itself: anyone can pull it out of a bundle. This is the part
 * that authenticates. It lets repeat reports from one install be tied together
 * and an abuser be banned by key rather than by whatever address they were on.
 *
 * **A key derived for this service alone, and not one of the per-server guest
 * keys.** Those are deliberately unlinkable from each other so two servers
 * cannot work out their members are the same person; signing a report with one
 * would tell this service which server the reporter uses. The seed derives a
 * key per scope, so a scope of its own costs nothing and keeps the property.
 *
 * A server join is a challenge-response; there is no round trip here. The
 * service replaces it with three things the client has to hold up together: the
 * assertion is bound to the exact bytes posted through `bh`, it expires in five
 * minutes, and its `jti` is accepted once.
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
    /* Null rather than throwing. The signature is optional at the service until
     * every client sends one, so a Keychain that will not open should cost the
     * signature and not the report — somebody trying to tell us the app is
     * broken is exactly who should not be refused. */
    return null;
  }
}
