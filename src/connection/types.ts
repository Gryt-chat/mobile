/* The shapes the server actually sends, taken from its own source rather than
 * guessed from what the client happens to read. */

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  description?: string;
  requirePushToTalk?: boolean;
  textInVoice?: boolean;
  /** What a member hears here until they set the channel themselves. Absent on an older server. */
  defaultNotificationLevel?: NotificationLevel;
  /** The channel permissions this member holds here. Absent on an older server. */
  myPermissions?: string[];
  /** What an older server sent instead of `myPermissions`. False narrows the server-wide answer. */
  canSend?: boolean;
  canJoin?: boolean;
  /** A forum lists topics instead of a timeline. Absent means chat. */
  layout?: "chat" | "forum";
  /** A forum's tag palette. Absent on a plain channel. */
  forumTags?: ForumTag[];
}

export interface ForumTag {
  id: string;
  name: string;
  emoji?: string | null;
  color?: string | null;
}

/** The three words the server stores; the desktop client's own setting uses the same. */
export type NotificationLevel = "all" | "mentions" | "none";

/**
 * The sidebar, which is the real ordering. A `separator` is a heading and contains
 * nothing; a `folder` holds children one level deep, through their `parentItemId`.
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
  /** Every role this member holds, so a role mention can tell it's aimed at them. */
  role_ids?: string[];
  voice_enabled?: boolean;
  version?: string;
  /**
   * What this account may do here, and what this server has heard of. Both absent on
   * an older server; `canOnServer` reads the difference, and nothing else should.
   */
  permissions?: string[];
  /**
   * The roles this server defines, with their ranks. Sent to every member, which is
   * the point: the editor's own list is gated behind `manage_roles`.
   */

  /* `color` is on the same payload and was simply not read here. `null` means the
     ordinary text colour rather than an invented hue. */
  roles?: { id: string; name?: string; rank: number; color?: string | null; mentionable?: boolean }[];
  permission_catalogue?: string[];
}

export interface ServerDetails {
  channels?: Channel[];
  /**
   * STUN servers, from the server's own configuration. Read here rather than by the
   * voice engine. **An empty list is voice not working**, not a detail.
   */
  stun_hosts?: string[];
  sidebar_items?: SidebarItem[];
  server_info?: ServerInfoDetails;
  error?: string;
}

export interface JoinedPayload {
  accessToken: string;
  refreshToken?: string;
  /** An older server's upload token (GRYT-740). A current one sends `fileKey` too. */
  fileToken?: string;
  /** What upload URLs are signed with (GRYT-1549). */
  fileKey?: unknown;
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
  /** `code` is the join's refusal, when there was one: `account_required` gets a sign-in button. */
  | { status: "error"; message: string; code?: string };

/**
 * A message, as the server sends it. **`sender_nickname` and `sender_avatar_file_id`
 * come from `enrichMessages` and are not on the row**, so they can be absent.
 */
export interface Message {
  conversation_id: string;
  message_id: string;
  sender_server_id: string;
  text: string | null;
  /**
   * The envelope, when this server was never given the words. **Set instead of
   * `text`, never alongside it**, and only in a direct message (GRYT-729).
   */
  sealed?: string | null;
  created_at: string;
  edited_at?: string | null;
  attachments?: string[] | null;
  reactions?: { src: string; amount: number; users: string[] }[] | null;
  reply_to_message_id?: string | null;
  /** Set on a reply inside a thread. Those stay out of the channel's own list. */
  thread_id?: string | null;
  sender_nickname?: string;
  sender_avatar_file_id?: string;
  /** Only on a webhook message, one to ten. Never read for mentions: only `text` pings. */
  cards?: StoredWebhookCard[] | null;
  /** `text` is a summary the server wrote for clients without cards, so it isn't drawn. */
  text_fallback?: boolean;
  /** The line the server writes for apps from before MLS (server#244). This app hides it. */
  mls_placeholder?: { seq: number; sender_server_id: string } | null;
  enriched_attachments?: {
    file_id: string;
    mime?: string;
    size?: number;
    original_name?: string;
    width?: number;
    height?: number;
    has_thumbnail?: boolean;
    /**
     * Where the decrypted copy of a sealed attachment is on this device — a `file://`
     * uri. The server holds ciphertext, so `attachmentUrl` draws broken (GRYT-761).
     */
    local_uri?: string;
  }[];
}

/** A card as the server stores it. Every picture is an upload on that server, never a remote URL. */
export interface StoredWebhookCard {
  title?: string;
  url?: string;
  /** Chat markdown. */
  description?: string;
  /** `#rrggbb`. */
  color?: string;
  author?: { name: string; url?: string; icon_file_id?: string };
  fields?: { name: string; value: string; inline: boolean }[];
  image_file_id?: string;
  thumbnail_file_id?: string;
  footer?: { text: string; icon_file_id?: string };
  /** ISO 8601. */
  timestamp?: string;
}

export interface ChatHistory {
  conversation_id: string;
  items: Message[];
  hasMore: boolean;
  /** Echoed back when the request carried one, so a page can be matched to it. */
  before?: string;
  /** The threads hanging off this page's messages. Absent on an older server. */
  threads?: ThreadSummary[];
}

/** A thread hangs off one root message. Same shape as the desktop's useThreads. */
export interface ThreadSummary {
  thread_id: string;
  conversation_id: string;
  root_message_id: string;
  title: string | null;
  status: "open" | "solved" | "closed";
  reply_count: number;
  last_message_at: string;
  /** Who started it. The server lets them and a moderator set the status. */
  created_by?: string;
  /** Locked to new replies, the way closed is. */
  locked?: boolean;
  /** Tag ids from the channel's palette. */
  tags?: string[];
}

/**
 * What a server says about a person, from `members:list`. **The broadcast dedupes on
 * a hash of selected fields**, which is what to check if one stops updating.
 */
export interface Member {
  /** Who they are on this server. Stable across renames. */
  serverUserId: string;
  nickname: string;
  /**
   * What this member says their DM public key is: a short JWT the server passes
   * through. What to make of it is `evaluateMemberKeys` in `@gryt/crypto`.
   */
  dmKeyBinding?: string | null;
  /** Their MLS person key, signed by the same identity (server#245). Checked the same way. */
  personKeyBinding?: string | null;
  /** Their uploaded picture, or null for the generated face. */
  avatarFileId?: string | null;
  /** Read off the identity by the server. It refuses a bot in a DM or a group. */
  isBot?: boolean;
  status?: UserStatus;
  /** The role their name is drawn in: the highest ranked one they hold. */
  role?: string;
  /**
   * Everything they hold, highest ranked first, with `role` at the front. Absent is
   * not empty — the server has no opinion, and the drawer falls back to `role`.
   */
  roles?: string[];
  /**
   * The SFU stream this person is publishing, or "" when not in a call. **The only
   * mapping from a voice stream back to a person.**
   */
  streamID?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  /**
   * Muted or deafened *by a moderator*, which outlives leaving the call. Read to
   * label the sheet: a Mute on somebody already server-muted reads as broken.
   */
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  voiceChannelId?: string;
  /** What they say they're doing, or a game's name. Only while they're connected (GRYT-929). */
  activity?: string;
  /** A game's Rich Presence, checked by the server. Only ever beside `activity` (GRYT-1310). */
  richActivity?: RichActivity;
}

/** The server's `richActivity`. It drops every other field, so nothing else is drawn. */
export interface RichActivity {
  type: "playing" | "listening" | "watching" | "competing";
  name: string;
  details?: string;
  state?: string;
  /** Epoch milliseconds. */
  startedAt?: number;
  party?: { size: number; max?: number };
  buttons?: { label: string; url: string }[];
}

/** Derived by the server from what you are doing. There is no manual picker. */
export type UserStatus = "online" | "in_voice" | "afk" | "offline";
