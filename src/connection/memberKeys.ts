import {
  asIdentityScope,
  evaluateMemberKeys,
  type MemberKeyState,
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
