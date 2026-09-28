import { buildLocalIdentity, type LocalIdentity } from "./certificate";
import { deriveLocalKeyPair } from "./keys";
import { derivationScopeFor } from "./linkedScopes";
import { getOrCreateSeed } from "./seed";

/**
 * The identity this device presents to one host. **Per host on purpose** — the key comes
 * from the seed *and* the hostname, or the scope a linked device was given for it.
 */
export async function getLocalIdentity(host: string): Promise<LocalIdentity> {
  const seed = await getOrCreateSeed();
  const { privateKey, publicJwk } = deriveLocalKeyPair(seed, await derivationScopeFor(host));
  return buildLocalIdentity(publicJwk, privateKey);
}

export type { LocalIdentity };
