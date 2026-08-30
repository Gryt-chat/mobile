import {
  asIdentityScope,
  deriveDmKeyPair,
  type DmKeyPair,
  signDmKeyBinding,
} from "@gryt/crypto";
import { p256 } from "@noble/curves/nist.js";

import { deriveLocalKeyPair } from "./keys";
import { getOrCreateSeed } from "./seed";

/**
 * This device's DM key for one server, and the statement that it is ours.
 *
 * Composition, like `localIdentity.ts`: the derivation and the signing are in
 * `@gryt/crypto`, the same code the desktop runs. What is here is reading the
 * seed out of the Keychain and the two decisions this app has to make about
 * which scope goes into which derivation.
 *
 * ## Two scopes, and they are not the same one
 *
 * The DM key is derived under the server's **lineage** — `srv:` and the origin
 * key id from the pin — because that survives the server changing address, and
 * a DM key that stops working when a router hands out a new lease takes every
 * message encrypted to it with it. `dmScopeFor` in `connection/pins.ts` is the
 * one that answers this.
 *
 * The identity this device **joins** with is still derived under the address.
 * That is GRYT-517 and it is not a one-line change: a guest identity has roles
 * and history filed under the address, and rederiving it would arrive at every
 * server already joined as a stranger.
 *
 * ## And the binding signs with neither of those
 *
 * It signs with `deriveLocalKeyPair(seed, dmScope)` — the lineage — which is
 * exactly the key the desktop client uses for its local identity on the same
 * server. That is deliberate and it is the point of doing it this way.
 *
 * A binding is trust on first use: `verifyDmKeyBinding` checks it signed itself
 * and named this scope, and nothing anywhere ties it to the identity the server
 * knows you by. What a peer pins is the thumbprint that keeps arriving. So a
 * phone and a laptop belonging to one person have to sign with the same key, or
 * the peer sees the thumbprint flip every time the other device publishes,
 * reads it as a substituted key, and refuses — which is the correct response to
 * what it can see.
 *
 * Signing with the join key would guarantee that flip, because the join key is
 * the address here and the lineage there. Signing with the lineage key makes
 * the two byte-identical, and costs nothing: the key is derived on demand from
 * a seed both devices hold, and it is never presented to a server.
 *
 * An account identity is the exception and it is not fixed here. The desktop
 * signs an account binding with a randomly generated per-device key, so two
 * desktops already flip against each other — see GRYT-759.
 */

/** The DM keypair for a server, private half included. */
export async function dmKeyPairFor(dmScope: string): Promise<DmKeyPair> {
  return deriveDmKeyPair(await getOrCreateSeed(), asIdentityScope(dmScope));
}

/** The public half on its own, for checking your own row in a member list. */
export async function ownDmPublicKey(dmScope: string): Promise<Uint8Array> {
  return (await dmKeyPairFor(dmScope)).publicKey;
}

/**
 * The signed statement that this DM key is ours, ready to publish.
 *
 * The signer takes the raw signing input rather than a digest, which is why
 * `prehash: true` is here — ES256 signs the SHA-256 of the input, and noble
 * otherwise expects the digest already. `p256.sign` returns the 64-byte r‖s
 * pair, which is what JWS wants; the other thing it could return is DER, and a
 * verifier would refuse every one of those.
 */
export async function dmKeyBindingFor(dmScope: string): Promise<string> {
  const seed = await getOrCreateSeed();
  const scope = asIdentityScope(dmScope);
  const { publicKey } = deriveDmKeyPair(seed, scope);
  const identity = deriveLocalKeyPair(seed, dmScope);

  return signDmKeyBinding({
    dmPublicKey: publicKey,
    scope,
    identityPrivateKey: async (bytes) =>
      p256.sign(bytes, identity.privateKey, { prehash: true }),
    identityPublicJwk: identity.publicJwk,
  });
}
