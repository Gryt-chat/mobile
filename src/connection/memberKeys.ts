import {
  asIdentityScope,
  evaluateMemberKeys,
  type MemberKeyState,
} from "@gryt/crypto";

import { ownDmPublicKey } from "../identity/dmKeys";
import { hydratePeerPins, peerPinStore } from "./peerPins";
import { dmScopeFor } from "./pins";
import type { Member } from "./types";

/**
 * What this app makes of the keys in a member list. The deciding is `evaluateMemberKeys`
 * in `@gryt/crypto`; what is here is the three platform answers it needs.
 * **Hydration comes first, and the await is load-bearing** (GRYT-727).
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
  try {
    ownKey = await ownDmPublicKey(scope);
  } catch {
    ownKey = null;
  }

  return evaluateMemberKeys({
    store: peerPinStore,
    scope,
    ownKey,
    members: members.map((member) => ({
      serverUserId: member.serverUserId,
      dmKeyBinding: member.dmKeyBinding,
    })),
    myServerUserId,
  });
}
