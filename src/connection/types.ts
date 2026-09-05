/* The shapes the server actually sends, taken from its own source rather than
 * guessed from what the client happens to read. */

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  description?: string;
  requirePushToTalk?: boolean;
  textInVoice?: boolean;
}

/**
 * The sidebar, which is the real ordering.
 *
 * **A `separator` is still a heading and contains nothing.** It draws a rule
 * with a label on it and the channels after it are not inside it, however much
 * it looks that way. That trap is why this note exists.
 *
 * A `folder` is the one that does contain things, and only channels, and only
 * one level deep. Membership is on the child through `parentItemId` rather than
 * on the folder through a list, so a channel is in one place or none and there
 * is nothing to keep in step.
 */
export interface SidebarItem {
  id: string;
  kind: "channel" | "separator" | "spacer" | "folder";
  position?: number;
  channelId?: string | null;
  spacerHeight?: number | null;
  /** The text, for a `separator` or a `folder`. */
  label?: string | null;
  /** The folder this channel is in. Only ever set on a channel. */
  parentItemId?: string | null;
}

export interface ServerInfoDetails {
  server_id?: string;
  name?: string;
  description?: string;
  icon_url?: string | null;
  is_owner?: boolean;
  role?: "owner" | "admin" | "mod" | "member";
  voice_enabled?: boolean;
  version?: string;
  /**
   * What this account may do here, and what this server has heard of.
   *
   * Both are absent from a server older than the feature, and `permissions`
   * alone is what the first release sent. `canOnServer` in `permissions.ts`
   * reads the difference; nothing else should test these directly.
   */
  permissions?: string[];
  /**
   * The roles this server defines, with their ranks.
   *
   * Sent to every member, which is the point of reading it here: rank decides
   * who may be moderated, and the editor's own `server:roles:definitions:list`
   * is gated behind `manage_roles`. A mod who may kick but not edit roles gets
   * nothing from that one.
   */
  /* `color` is on the same payload and was simply not read here before. It is
     `null` for a role nobody has given one, and the drawer treats that as "use
     the ordinary text colour" rather than inventing a hue. */
  roles?: { id: string; name?: string; rank: number; color?: string | null }[];
  permission_catalogue?: string[];
}

export interface ServerDetails {
  channels?: Channel[];
  /**
   * STUN servers, from the server's own configuration. Read here rather than by
   * the voice engine, which is deliberately not told which server is on screen.
   * **An empty list is voice not working**, not a detail.
   */
  stun_hosts?: string[];
  sidebar_items?: SidebarItem[];
  server_info?: ServerInfoDetails;
  error?: string;
}

export interface JoinedPayload {
  accessToken: string;
  refreshToken?: string;
  /** Reads uploads on this server and nothing else. GRYT-740. */
  fileToken?: string;
  nickname?: string;
  isOwner?: boolean;
  setupRequired?: boolean;
}

/** What a server is willing to admit. Named, because it is now chosen between. */
export type IdentityTier = "account" | "local";

export interface ChallengePayload {
  nonce: string;
  serverHost: string;
  identityTiers?: IdentityTier[];
}

export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting" }
  /** Talking, and the server proved itself (or is old enough not to). */
  | { status: "joining" }
  | {
      status: "ready";
      channels: Channel[];
      sidebar: SidebarItem[];
      details?: ServerInfoDetails;
      stunHosts: string[];
    }
  | { status: "refused"; reason: string; detail: string }
  | { status: "error"; message: string };

/**
 * A message, as the server sends it. Snake case because that is what comes over
 * the wire, and `created_at` is an ISO string by the time it lands here.
 *
 * **`sender_nickname` and `sender_avatar_file_id` come from `enrichMessages`
 * and are not on the row**, so a message can arrive without them.
 */
export interface Message {
  conversation_id: string;
  message_id: string;
  sender_server_id: string;
  text: string | null;
  /**
   * The envelope, when this server was never given the words (GRYT-729). **Set
   * instead of `text`, never alongside it** — the handler refuses both — and
   * only in a direct message. Opening is `openForConversation` in
   * `@gryt/crypto`.
   */
  sealed?: string | null;
  created_at: string;
  edited_at?: string | null;
  attachments?: string[] | null;
  reactions?: { src: string; amount: number; users: string[] }[] | null;
  reply_to_message_id?: string | null;
  sender_nickname?: string;
  sender_avatar_file_id?: string;
  enriched_attachments?: {
    file_id: string;
    mime?: string;
    size?: number;
    original_name?: string;
    width?: number;
    height?: number;
    has_thumbnail?: boolean;
    /**
     * Where the decrypted copy of a sealed attachment is on this device
     * (GRYT-761) — a `file://` uri in the cache. The server holds ciphertext,
     * so pointing an `Image` at `attachmentUrl` draws a broken picture.
     */
    local_uri?: string;
  }[];
}

export interface ChatHistory {
  conversation_id: string;
  items: Message[];
  hasMore: boolean;
  /** Echoed back when the request carried one, so a page can be matched to it. */
  before?: string;
}

/**
 * What a server says about a person, from `members:list` — the fields the app
 * reads, not the whole payload.
 *
 * Built by `buildMemberList` on the server. **The broadcast dedupes on a hash
 * of selected fields**, which is what to check if one stops updating.
 */
export interface Member {
  /** Who they are on this server. Stable across renames. */
  serverUserId: string;
  nickname: string;
  /**
   * What this member says their DM public key is (GRYT-720). A short JWT the
   * server passes through without reading. What to make of it is
   * `evaluateMemberKeys` in `@gryt/crypto`, the same decision the desktop runs.
   */
  dmKeyBinding?: string | null;
  /** Their uploaded picture, or null for the generated face. */
  avatarFileId?: string | null;
  status?: UserStatus;
  /** The role their name is drawn in: the highest ranked one they hold. */
  role?: string;
  /**
   * Everything they hold, highest ranked first, with `role` at the front.
   *
   * Absent from a server that predates GRYT-748, where a member could hold
   * exactly one. Absent is not empty — it means the server has no opinion, and
   * the drawer falls back to `role` alone.
   */
  roles?: string[];
  /**
   * The SFU stream this person is publishing, or "" when not in a call. **The
   * only mapping from a voice stream back to a person** — `@gryt/voice` carries
   * no identity, so a remote tile could say somebody is here and not who.
   */
  streamID?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  /**
   * Muted or deafened *by a moderator*, which outlives leaving the call. Read
   * to label the sheet: a Mute action on somebody already server-muted does
   * nothing and reads as broken.
   */
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  voiceChannelId?: string;
}

/** Derived by the server from what you are doing. There is no manual picker. */
export type UserStatus = "online" | "in_voice" | "afk" | "offline";
