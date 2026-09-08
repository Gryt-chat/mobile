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
 * This device's DM key for one server, and the statement that it is ours. The key derives
 * under the lineage, the join identity under the address, and the binding signs lineage.
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
