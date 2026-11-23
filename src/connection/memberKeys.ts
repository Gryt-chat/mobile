import {
  asIdentityScope,
  evaluateMemberKeys,
  getPeerPin,
  type IdentityScope,
  type MemberKeyState,
  type PeerPin,
} from "@gryt/crypto";

import { ownDmPublicKey } from "../identity/dmKeys";
import { ownPersonPublicKey } from "../identity/personKey";
import { hydratePeerPins, peerPinStore } from "./peerPins";
import { dmScopeFor } from "./pins";
import type { Member } from "./types";

/**
 * What this app makes of the keys in a member list. `evaluateMemberKeys` in `@gryt/crypto`
 * decides; here are the three platform answers it needs. Hydrate first (GRYT-727).
 */
export async function evaluateMobileMemberKeys({
  host,
  members,
  myServerUserId,
}: {
  host: string;
  members: Member[];
  /** Null before the session has said which row is yours. */
  myServerUserId: string | null;
}): Promise<Record<string, MemberKeyState>> {
  // One at a time per server, so a second list finds what the first one checked.
  const run = (queue.get(host) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => evaluate(host, members, myServerUserId));
  queue.set(host, run);
  return run;
}

interface Checked {
  dm: string | null | undefined;
  person: string | null | undefined;
  pin: PeerPin | null;
  self: boolean;
  state: MemberKeyState;
}

const queue = new Map<string, Promise<Record<string, MemberKeyState>>>();
const checked = new Map<string, Map<string, Checked>>();

async function evaluate(
  host: string,
  members: Member[],
  myServerUserId: string | null,
): Promise<Record<string, MemberKeyState>> {
  await hydratePeerPins();

  const scope = asIdentityScope(await dmScopeFor(host));
  // Null turns the self-check off rather than failing the evaluation: not holding a seed
  // is ordinary on a device that has not joined anywhere.
  let ownKey: Uint8Array | null = null;
  let ownPersonKey: Uint8Array | null = null;
  try {
    ownKey = await ownDmPublicKey(scope);
    ownPersonKey = await ownPersonPublicKey(scope);
  } catch {
    ownKey = null;
  }
  // Your own row is judged against your keys, so a seed arriving starts the cache again.
  const cacheKey = [host, scope, ownKey?.join(","), ownPersonKey?.join(",")].join("\n");
  const cache = checked.get(cacheKey) ?? new Map<string, Checked>();
  checked.set(cacheKey, cache);

  // Every list is resent whole on a presence change, and each binding costs a p256 verify (~25 ms on Hermes).
  const seen = (member: Member): Omit<Checked, "state"> => ({
    dm: member.dmKeyBinding,
    person: member.personKeyBinding,
    pin: getPeerPin(peerPinStore, scope, member.serverUserId),
    self: member.serverUserId === myServerUserId,
  });
  const stale = members
    .map((member) => ({ member, now: seen(member) }))
    .filter(({ member, now }) => {
      const held = cache.get(member.serverUserId);
      return !held || held.dm !== now.dm || held.person !== now.person || held.pin !== now.pin || held.self !== now.self;
    });

  if (stale.length > 0) {
    const fresh = await evaluateWith(scope, stale.map((s) => s.member), myServerUserId, ownKey, ownPersonKey);
    for (const { member, now } of stale) cache.set(member.serverUserId, { ...now, state: fresh[member.serverUserId] });
  }

  const states: Record<string, MemberKeyState> = {};
  for (const member of members) {
    const held = cache.get(member.serverUserId);
    if (held) states[member.serverUserId] = held.state;
  }
  return states;
}

async function evaluateWith(
  scope: IdentityScope,
  members: Member[],
  myServerUserId: string | null,
  ownKey: Uint8Array | null,
  ownPersonKey: Uint8Array | null,
): Promise<Record<string, MemberKeyState>> {
  return evaluateMemberKeys({
    store: peerPinStore,
    scope,
    ownKey,
    ownPersonKey,
    // The person key is pinned here too, before the MLS driver ever meets their devices.
    members: members.map((member) => ({
      serverUserId: member.serverUserId,
      dmKeyBinding: member.dmKeyBinding,
      personKeyBinding: member.personKeyBinding,
    })),
    myServerUserId,
  });
}
