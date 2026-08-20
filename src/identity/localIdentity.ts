import { buildLocalIdentity, type LocalIdentity } from "./certificate";
import { deriveLocalKeyPair } from "./keys";
import { getOrCreateSeed } from "./seed";

/**
 * The identity this device presents to one host.
 *
 * Per host on purpose: the key is derived from the seed *and* the hostname, so
 * two servers cannot compare notes and work out that their members are the same
 * person.
 *
 * Everything here is composition. The signing is in `certificate.ts` and the
 * derivation in `keys.ts`, both free of native modules so they can be tested
 * against the desktop client's vectors; this file is the part that reads the
 * Keychain and therefore cannot be.
 */
export async function getLocalIdentity(host: string): Promise<LocalIdentity> {
  const seed = await getOrCreateSeed();
  const { privateKey, publicJwk } = deriveLocalKeyPair(seed, host);
  return buildLocalIdentity(publicJwk, privateKey);
}

export type { LocalIdentity };
