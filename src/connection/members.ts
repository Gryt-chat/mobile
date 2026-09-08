import { attachmentUrl } from "../chat/files";
import type { Member } from "./types";

/**
 * The two lookups the app makes against a member list. Pure and in its own file,
 * because the provider holding it reaches a socket and React.
 */
export interface MemberIndex {
  /** By server user id, which is what a message and a session both name. */
  byId: Map<string, Member>;
  /**
   * By the SFU stream they are publishing — **the only mapping from a voice stream back
   * to a person**, since `@gryt/voice` carries no identity.
   */
  byStreamId: Map<string, Member>;
}

export function indexMembers(members: Member[]): MemberIndex {
  const byId = new Map<string, Member>();
  const byStreamId = new Map<string, Member>();

  for (const member of members) {
    byId.set(member.serverUserId, member);

    /* `streamID` is `""` for everybody not in a call, so an empty one is not a key —
     * mapping it makes whoever was iterated last the answer for every unknown. */
    if (member.streamID) byStreamId.set(member.streamID, member);
  }

  return { byId, byStreamId };
}

/**
 * Where a member's uploaded picture lives, or null for the generated face. **Full size
 * rather than `?thumb=1`**: the thumbnail is AVIF, which RN decodes only recently.
 */
export function memberAvatarUrl(
  host: string | null,
  member: Member | undefined,
): string | null {
  if (!host || !member?.avatarFileId) return null;
  return attachmentUrl(host, member.avatarFileId);
}
