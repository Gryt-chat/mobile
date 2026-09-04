import { buildLocalIdentity, type LocalIdentity } from "./certificate";
import { deriveLocalKeyPair } from "./keys";
import { getOrCreateSeed } from "./seed";

/**
 * The identity this device presents to one host. **Per host on purpose** — the
 * key comes from the seed *and* the hostname, so two servers cannot work out
 * that their members are the same person.
 *
 * Composition only: the signing and derivation live in files free of native
 * modules so they can be tested; this is the part that reads the Keychain.
 */
export async function getLocalIdentity(host: string): Promise<LocalIdentity> {
  const seed = await getOrCreateSeed();
  const { privateKey, publicJwk } = deriveLocalKeyPair(seed, host);
  return buildLocalIdentity(publicJwk, privateKey);
}

export type { LocalIdentity };
