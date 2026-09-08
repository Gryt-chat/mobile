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
 * This device's DM key for one server, and the statement that it is ours — **two scopes
 * that are not the same one**. The DM key derives under the server's **lineage**, which
 * survives a change of address; the identity it **joins** with is still the address
 * (GRYT-517). **The binding signs with the lineage key**, or a peer sees a flip.
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
 * The signed statement that this DM key is ours. **`prehash: true`**, because ES256
 * signs the SHA-256 of the input. `p256.sign` returns the r‖s pair JWS wants.
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
