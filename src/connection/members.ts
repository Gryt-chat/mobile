import { attachmentUrl } from "../chat/files";
import type { Member } from "./types";

/**
 * The two lookups the app makes against a member list. Pure and in its own file
 * because the provider holding it reaches a socket and React, neither of which
 * loads in a test.
 */
export interface MemberIndex {
  /** By server user id, which is what a message and a session both name. */
  byId: Map<string, Member>;
  /**
   * By the SFU stream they are publishing — **the only mapping from a voice
   * stream back to a person**, since `@gryt/voice` keys by stream id and
   * carries `isLocal` and nothing else.
   */
  byStreamId: Map<string, Member>;
}

export function indexMembers(members: Member[]): MemberIndex {
  const byId = new Map<string, Member>();
  const byStreamId = new Map<string, Member>();

  for (const member of members) {
    byId.set(member.serverUserId, member);

    /* `streamID` is `""` for everybody not in a call — the server writes
     * `onlineClient?.streamID || ''` — so an empty one is not a key. Mapping it
     * would make whoever was iterated last the answer for every stream that has
     * no member, which is the case this lookup exists to report as unknown. */
    if (member.streamID) byStreamId.set(member.streamID, member);
  }

  return { byId, byStreamId };
}

/**
 * Where a member's uploaded picture lives, or null for the generated face.
 * **Full size rather than `?thumb=1`**: the thumbnail is AVIF at 128px against
 * a 256 cap, and RN's `Image` decodes AVIF only from iOS 16 and Android 12.
 */
export function memberAvatarUrl(
  host: string | null,
  member: Member | undefined,
): string | null {
  if (!host || !member?.avatarFileId) return null;
  return attachmentUrl(host, member.avatarFileId);
}
