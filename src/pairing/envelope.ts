import {
  asIdentityScope,
  type PairingAccount,
  type PairingEnvelope,
  type PairingPin,
  type PairingServer,
  type PeerPin,
} from "@gryt/crypto";

/* What this phone seals to a new device on Approve (GRYT-1484). Pure, so it can be tested
   without the Keychain; `collectEnvelope.ts` reads the stores and calls it. */

export interface EnvelopeServer {
  host: string;
  name: string;
  nickname?: string;
  scheme?: "http" | "https";
}

export interface EnvelopeInput {
  seed: Uint8Array;
  /** The account and the config it signed in with, or null for a guest. */
  account: { issuer: string; clientId: string; identityUrl: string; sub: string; username: string } | null;
  servers: EnvelopeServer[];
  /** What this phone derives each server's guest key under. Still the address here (GRYT-517). */
  scopeFor: (host: string) => string;
  /** The peer pin store as it's kept: `"<scope> <member id>"` to the pin. */
  pins: Record<string, PeerPin>;
  /** Per pin scope, the members seen on MLS (decision 4). */
  seenOnMls: Record<string, ReadonlySet<string>>;
  from: string;
}

/** The pin store's flat keys, split back into scope and member at the first space. */
export function pinsByScope(
  pins: Record<string, PeerPin>,
  seenOnMls: Record<string, ReadonlySet<string>>,
): Record<string, Record<string, PairingPin>> {
  const out: Record<string, Record<string, PairingPin>> = {};
  for (const [key, pin] of Object.entries(pins)) {
    const space = key.indexOf(" ");
    if (space <= 0 || space === key.length - 1) continue;
    const scope = key.slice(0, space);
    const member = key.slice(space + 1);
    if (scope === "__proto__" || member === "__proto__") continue;
    const copy: PairingPin = {
      thumbprint: pin.thumbprint,
      dmPublicKey: pin.dmPublicKey,
      firstSeenAt: pin.firstSeenAt,
      lastSeenAt: pin.lastSeenAt,
    };
    if (pin.personPublicKey !== undefined) copy.personPublicKey = pin.personPublicKey;
    if (pin.comparedAt !== undefined) copy.comparedAt = pin.comparedAt;
    if (seenOnMls[scope]?.has(member)) copy.seenOnMls = true;
    (out[scope] ??= {})[member] = copy;
  }
  return out;
}

export function buildEnvelope(input: EnvelopeInput): PairingEnvelope {
  const servers: PairingServer[] = input.servers.map((s) => {
    const server: PairingServer = { host: s.host, name: s.name, scope: asIdentityScope(input.scopeFor(s.host)) };
    if (s.nickname) server.nickname = s.nickname;
    if (s.scheme) server.scheme = s.scheme;
    return server;
  });
  const envelope: PairingEnvelope = {
    seed: input.seed,
    // Every key this phone has comes from the seed, so there's nothing else to carry.
    keys: [],
    servers,
    pins: pinsByScope(input.pins, input.seenOnMls),
    from: input.from,
  };
  if (input.account) {
    const account: PairingAccount = { ...input.account };
    envelope.account = account;
  }
  return envelope;
}
