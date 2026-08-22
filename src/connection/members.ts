import { attachmentUrl } from "../chat/files";
import type { Member } from "./types";

/**
 * The two lookups the app makes against a member list.
 *
 * Pure and in its own file for the reason `tabMotion.ts` is: the provider that
 * holds this reaches a socket and React, and neither can be loaded in a test —
 * so logic left inside it is logic that cannot have one, including the part
 * that has a real case in it. Here the case is `streamID`.
 */
export interface MemberIndex {
  /** By server user id, which is what a message and a session both name. */
  byId: Map<string, Member>;
  /**
   * By the SFU stream they are publishing.
   *
   * The only mapping there is from a voice stream back to a person:
   * `@gryt/voice` keys `streams` by stream id and carries `isLocal` and nothing
   * else. GRYT-452 recorded that as a boundary; the server had already crossed
   * it and nothing read the field.
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
 *
 * Full size rather than `?thumb=1`. The thumbnail is AVIF at 128px and the
 * stored avatar is capped at 256, so the saving is small — and React Native's
 * `Image` decodes what the OS decodes, which for AVIF is iOS 16 and Android 12.
 * The app's floor is iOS 16.4, so the full file is safe there and the thumbnail
 * buys little. `PersonAvatar` falls back to the generated face either way.
 */
export function memberAvatarUrl(
  host: string | null,
  member: Member | undefined,
): string | null {
  if (!host || !member?.avatarFileId) return null;
  return attachmentUrl(host, member.avatarFileId);
}
