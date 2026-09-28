import {
  asIdentityScope,
  createMlsDevice,
  derivePersonKeyPair,
  signPersonKeyBinding,
} from "@gryt/crypto";
import type { MlsDeviceRecord } from "@gryt/core";
import { p256 } from "@noble/curves/nist.js";

import { deriveLocalKeyPair } from "./keys";
import { getOrCreateSeed } from "./seed";

/**
 * The MLS person key for one server, from the 24 words, and the statement that it is ours.
 * Same scope and same signer as the DM key binding, which the server checks it against.
 */

/** The public half, for the pins and for spotting your own devices. */
export async function ownPersonPublicKey(dmScope: string): Promise<Uint8Array> {
  return derivePersonKeyPair(await getOrCreateSeed(), asIdentityScope(dmScope)).publicKey;
}

/** Signed with **`prehash: true`**, for the same reason as `dmKeyBindingFor`. */
export async function personKeyBindingFor(dmScope: string): Promise<string> {
  const seed = await getOrCreateSeed();
  const scope = asIdentityScope(dmScope);
  const identity = deriveLocalKeyPair(seed, dmScope);

  return signPersonKeyBinding({
    personPublicKey: derivePersonKeyPair(seed, scope).publicKey,
    scope,
    identityPrivateKey: async (bytes) => p256.sign(bytes, identity.privateKey, { prehash: true }),
    identityPublicJwk: identity.publicJwk,
  });
}

/** This phone's first MLS leaf on a server. The leaf key is random; the seed only certifies it. */
export async function newMlsDevice(dmScope: string, deviceName: string): Promise<MlsDeviceRecord> {
  const device = createMlsDevice({
    seed: await getOrCreateSeed(),
    scope: asIdentityScope(dmScope),
    deviceName,
  });
  return {
    deviceId: device.deviceId,
    signKey: device.signKey,
    publicKey: device.publicKey,
    certificate: device.certificate,
  };
}
