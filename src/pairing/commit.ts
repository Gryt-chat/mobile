import type { PairingTokens } from "@gryt/core";
import type { PairingEnvelope, PeerPin } from "@gryt/crypto";

/* What a phone being linked writes, once core has checked everything (GRYT-1484). Every store
   is passed in, so the order and the contents can be tested without the Keychain. */

export interface LinkStores {
  /** Point the account at the envelope's Keycloak and identity service, before any token is kept. */
  setAuthServer(issuer: string, identityUrl: string): Promise<void>;
  restoreSeed(seed: Uint8Array): Promise<void>;
  /** Per server, what its guest key derives under. Written before any server is joined. */
  writeScopes(scopes: { host: string; scope: string }[]): Promise<void>;
  /** The peer pin store's flat map, merged in: `"<scope> <member id>"` to the pin. */
  mergePins(pins: Record<string, PeerPin>): Promise<void>;
  markSeenOnMls(scope: string, member: string): Promise<void>;
  adoptTokens(tokens: { accessToken: string; refreshToken?: string; idToken: string }): Promise<void>;
  addServer(server: { host: string; name: string; nickname?: string; scheme?: "http" | "https" }): Promise<void>;
}

/** The pins as the phone keeps them, and who among them was seen on MLS. */
export function flattenPins(envelope: PairingEnvelope): { pins: Record<string, PeerPin>; seen: [string, string][] } {
  const pins: Record<string, PeerPin> = {};
  const seen: [string, string][] = [];
  for (const [scope, members] of Object.entries(envelope.pins)) {
    for (const [member, pin] of Object.entries(members)) {
      const { seenOnMls, ...rest } = pin;
      pins[`${scope} ${member}`] = rest;
      if (seenOnMls) seen.push([scope, member]);
    }
  }
  return { pins, seen };
}

/** The seed and scopes first, then the pins, then the account, and the servers last, since adding one connects. */
export async function commitLink(envelope: PairingEnvelope, tokens: PairingTokens | null, stores: LinkStores): Promise<void> {
  if (envelope.account) {
    if (!tokens) throw new Error("An account link came without tokens.");
    await stores.setAuthServer(envelope.account.issuer, envelope.account.identityUrl);
  }
  await stores.restoreSeed(envelope.seed);
  await stores.writeScopes(envelope.servers.map(({ host, scope }) => ({ host, scope })));

  const { pins, seen } = flattenPins(envelope);
  await stores.mergePins(pins);
  for (const [scope, member] of seen) await stores.markSeenOnMls(scope, member);

  if (envelope.account && tokens) {
    await stores.adoptTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, idToken: tokens.idToken });
  }
  for (const s of envelope.servers) {
    await stores.addServer({ host: s.host, name: s.name, nickname: s.nickname, scheme: s.scheme });
  }
}
