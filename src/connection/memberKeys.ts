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
 * What this app makes of the keys in a member list (GRYT-727).
 *
 * The deciding is `evaluateMemberKeys` in `@gryt/crypto`, and it is the same
 * call the desktop makes with the same arguments. What is here is the three
 * things it needs that only this platform can answer: where pins live, which
 * scope this server derives under, and this device's own key.
 *
 * ## Hydration comes first, and it is not a detail
 *
 * `peerPinStore` reads empty until `hydratePeerPins` has resolved. Evaluating
 * against an empty store makes every member read as `first`, and
 * `evaluateMemberKeys` pins a `first` — which is the one thing pinning exists
 * to stop. On a device that has pinned somebody, a substituted key would be
 * pinned over the real one, on the first member list after every launch, and
 * nothing would look different.
 *
 * So the await is load-bearing rather than tidy.
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

  // Null turns the self-check off rather than failing the evaluation. Not
  // holding a seed is an ordinary state on a device that has not joined
  // anywhere, and it says nothing about anybody else's key.
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
