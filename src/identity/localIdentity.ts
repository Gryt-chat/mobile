import { buildLocalIdentity, type LocalIdentity } from "./certificate";
import { deriveLocalKeyPair } from "./keys";
import { getOrCreateSeed } from "./seed";

/**
 * The identity this device presents to one host. **Per host on purpose** — the key comes
 * from the seed *and* the hostname. Composition only: this is the Keychain half.
 */
export async function getLocalIdentity(host: string): Promise<LocalIdentity> {
  const seed = await getOrCreateSeed();
  const { privateKey, publicJwk } = deriveLocalKeyPair(seed, host);
  return buildLocalIdentity(publicJwk, privateKey);
}

export type { LocalIdentity };
