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
 * This device's DM key for one server, and the statement that it is ours. The
 * derivation and signing are in `@gryt/crypto`; what is here is reading the
 * seed out of the Keychain, and **two scopes that are not the same one**.
 *
 * The DM key is derived under the server's **lineage** (`dmScopeFor` in
 * `connection/pins.ts`), which survives the server changing address — a DM key
 * that breaks on a new lease takes every message encrypted to it with it.
 *
 * The identity this device **joins** with is still derived under the address.
 * That is GRYT-517 and is not a one-line change: a guest identity has roles and
 * history filed under the address.
 *
 * **The binding signs with the lineage key**, which is byte-identical to the
 * desktop's local identity on the same server. A peer pins the thumbprint that
 * keeps arriving, so signing with the join key would guarantee a flip — the
 * address here and the lineage there — which the peer reads as substitution.
 *
 * An account identity is the exception and is not fixed here (GRYT-759).
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
 * The signed statement that this DM key is ours. **`prehash: true`** because
 * ES256 signs the SHA-256 of the input and noble otherwise expects a digest.
 * `p256.sign` returns the 64-byte r‖s pair JWS wants; DER would be refused.
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
