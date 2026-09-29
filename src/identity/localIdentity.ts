import { buildLocalIdentity, type LocalIdentity } from "./certificate";
import { importedKeyFor } from "./importedKeys";
import { deriveLocalKeyPair } from "./keys";
import { derivationScopeFor } from "./linkedScopes";
import { getOrCreateSeed } from "./seed";

/**
 * The identity this device presents to one host. **Per host on purpose** — the key comes
 * from the seed *and* the hostname, or the scope a linked device was given for it.
 */
export async function getLocalIdentity(host: string): Promise<LocalIdentity> {
  const seed = await getOrCreateSeed();
  const scope = await derivationScopeFor(host);
  // A key the linking device couldn't derive wins, as its own stored keys do there.
  const { privateKey, publicJwk } = (await importedKeyFor(scope)) ?? deriveLocalKeyPair(seed, scope);
  return buildLocalIdentity(publicJwk, privateKey);
}

export type { LocalIdentity };
