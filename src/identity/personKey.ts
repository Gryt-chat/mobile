import {
  asIdentityScope,
  createMlsDevice,
  derivePersonKeyPair,
  signPersonKeyBinding,
} from "@gryt/crypto";
import type { MlsDeviceRecord } from "@gryt/core";
import { p256 } from "@noble/curves/nist.js";

import { fromSeed, publicFromSeed } from "./derived";
import { base64Url, base64UrlDecode } from "./encoding";
import { deriveLocalKeyPair } from "./keys";
import { getOrCreateSeed } from "./seed";

/**
 * The MLS person key for one server, from the 24 words, and the statement that it is ours.
 * Same scope and same signer as the DM key binding, which the server checks it against.
 */

/** The public half, for the pins and for spotting your own devices. */
export async function ownPersonPublicKey(dmScope: string): Promise<Uint8Array> {
  const seed = await getOrCreateSeed();
  return base64UrlDecode(
    await publicFromSeed("personPublicKey", seed, dmScope, () => base64Url(derivePersonKeyPair(seed, asIdentityScope(dmScope)).publicKey)),
  );
}

/** Signed with **`prehash: true`**, for the same reason as `dmKeyBindingFor`. */
export async function personKeyBindingFor(dmScope: string): Promise<string> {
  const seed = await getOrCreateSeed();
  return publicFromSeed("personKeyBinding", seed, dmScope, async () => {
    const identity = fromSeed("localKeyPair", seed, dmScope, () => deriveLocalKeyPair(seed, dmScope));
    return signPersonKeyBinding({
      personPublicKey: await ownPersonPublicKey(dmScope),
      scope: asIdentityScope(dmScope),
      identityPrivateKey: async (bytes) => p256.sign(bytes, identity.privateKey, { prehash: true }),
      identityPublicJwk: identity.publicJwk,
    });
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
