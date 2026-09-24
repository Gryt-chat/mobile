import { createContext, useContext } from "react";

import { massMentionHits, type ChannelName, type MentionTarget } from "./mentionTokens";

/** Who is reading, so a mention can say whether it hit them and a channel can be named. */
export interface MentionReader {
  meId: string | null;
  roleIds: readonly string[];
  suppressEveryone: boolean;
  /** False in a DM, where @everyone, @here and roles never ping. */
  massAllowed: boolean;
  roles: ReadonlyMap<string, { name: string; color: string | null }>;
  /** Null for a channel this reader can't see, which then reads #private-channel. */
  channelName: ChannelName;
  openChannel: (id: string, host: string | null) => void;
}

export const MentionReaderContext = createContext<MentionReader | null>(null);

export function useMentionReader(): MentionReader | null {
  return useContext(MentionReaderContext);
}

/** Whether one token names the reader. */
export function tokenHits(target: MentionTarget, reader: MentionReader | null): boolean {
  if (!reader) return false;
  if (target.kind === "user") return reader.meId !== null && target.id === reader.meId;
  if (!reader.massAllowed) return false;
  if (target.kind === "everyone" || target.kind === "here") return !reader.suppressEveryone;
  if (target.kind === "role") return reader.roleIds.includes(target.id);
  return false;
}

/** Whether a message names this member, for Only mentions: by id, by nickname, or through
    @everyone, @here or a role. The nickname rule is the server's `findMentions`. */
export function mentionsMe(
  text: string | null | undefined,
  me: { serverUserId?: string | null; nickname?: string | null; roleIds?: readonly string[]; suppressEveryone?: boolean },
): boolean {
  if (!text || !text.includes("@")) return false;
  if (me.serverUserId && text.includes(`(mention:${me.serverUserId})`)) return true;
  if (massMentionHits(text, me)) return true;
  const nickname = me.nickname?.trim().toLowerCase();
  if (!nickname) return false;
  const lower = text.toLowerCase();
  for (let at = lower.indexOf(`@${nickname}`); at !== -1; at = lower.indexOf(`@${nickname}`, at + 1)) {
    const before = at > 0 ? lower[at - 1] : "";
    const after = lower[at + 1 + nickname.length] ?? "";
    if (!/\w/.test(before) && !/\w/.test(after)) return true;
  }
  return false;
}
