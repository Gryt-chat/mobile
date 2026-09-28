import type { PairingEnvelope } from "@gryt/crypto";

import { accountConfig } from "../account/config";
import type { AccountProfile } from "../account/profile";
import { hydratePeerPins, peerPinStore } from "../connection/peerPins";
import { getOrCreateSeed } from "../identity/seed";
import { identityScopeFor } from "../identity/scope";
import { seenOnMlsFor } from "../mls/seenOnMls";
import type { JoinedServer } from "../servers/store";
import { buildEnvelope } from "./envelope";
import { PHONE_NAME } from "./device";

/** Everything this phone hands a device it approves, read fresh from the stores. */
export async function collectEnvelope(servers: JoinedServer[], profile: AccountProfile | null): Promise<PairingEnvelope> {
  await hydratePeerPins();
  const pins = peerPinStore.read();

  const seenOnMls: Record<string, Set<string>> = {};
  for (const key of Object.keys(pins)) {
    const space = key.indexOf(" ");
    if (space <= 0) continue;
    const scope = key.slice(0, space);
    const member = key.slice(space + 1);
    if (await seenOnMlsFor(scope).has(member)) (seenOnMls[scope] ??= new Set()).add(member);
  }

  const config = accountConfig();
  return buildEnvelope({
    seed: await getOrCreateSeed(),
    account: profile
      ? { issuer: config.issuer, clientId: config.clientId, identityUrl: config.identityUrl, sub: profile.sub, username: profile.label }
      : null,
    servers,
    scopeFor: identityScopeFor,
    pins,
    seenOnMls,
    from: PHONE_NAME,
  });
}
