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
 * There are no categories in Gryt. A `separator` with a `label` renders as a
 * heading and does **not** contain the channels after it — sort by `position`
 * and render linearly. Worth knowing before building a tree that cannot exist.
 */
export interface SidebarItem {
  id: string;
  kind: "channel" | "separator" | "spacer";
  position?: number;
  channelId?: string | null;
  spacerHeight?: number | null;
  label?: string | null;
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
   * STUN servers, from the server's own configuration.
   *
   * Read here rather than by the voice engine, which is deliberately not told
   * which server is on screen — it gets the answer instead of the lookup. The
   * engine refuses to connect without at least one, so an empty list is not a
   * detail: it is voice not working, and the server logs its own error about
   * it at boot.
   */
  stun_hosts?: string[];
  sidebar_items?: SidebarItem[];
  server_info?: ServerInfoDetails;
  error?: string;
}

export interface JoinedPayload {
  accessToken: string;
  refreshToken?: string;
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
 * A message, as the server sends it.
 *
 * Snake case throughout, because that is what comes over the wire — renaming it
 * on arrival would mean two shapes for one thing and a mapping to keep correct.
 * `created_at` is a `Date` server-side and an ISO string by the time it lands
 * here, which is why every read of it goes through `new Date(...)`.
 *
 * `sender_nickname` and `sender_avatar_file_id` are added by the server's
 * `enrichMessages` and are not stored on the row — a message can arrive without
 * them, so nothing may depend on their being there.
 */
export interface Message {
  conversation_id: string;
  message_id: string;
  sender_server_id: string;
  text: string | null;
  /**
   * The envelope, when this server was never given the words (GRYT-729).
   *
   * Set instead of `text`, never alongside it — the handler refuses both — and
   * only in a direct message. What is in it is a random key per message,
   * encrypted once for each member, and the body under it; opening is
   * `openForConversation` in `@gryt/crypto`.
   *
   * Null on every message sent before this existed and on every channel
   * message, which is the ordinary case and stays the ordinary case.
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
     * (GRYT-761).
     *
     * A `file://` uri in the cache. The server holds ciphertext under
     * `application/octet-stream`, so pointing an `Image` at `attachmentUrl`
     * would draw a broken picture — everything above this line came out of the
     * sealed message rather than off the server, and so does the file itself.
     *
     * Absent for every attachment that went up in the clear, which is all of
     * them until this shipped.
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
 * What a server is willing to say about a person, from `members:list`.
 *
 * The fields the app reads, not the whole payload — the server sends role
 * history, identity fingerprints and per-member moderation state as well, and
 * declaring fields nothing draws would be inventing consumers for them.
 *
 * Built by `buildMemberList` in the server's `socket/utils/clients.ts`, which is
 * shared by the `members:fetch` handler and the broadcast, so both carry the
 * same shape. The broadcast dedupes on a hash of selected fields — worth knowing
 * if a field ever looks like it stops updating.
 */
export interface Member {
  /** Who they are on this server. Stable across renames. */
  serverUserId: string;
  nickname: string;
  /**
   * What this member says their DM public key is (GRYT-720).
   *
   * A short JWT signed by the identity key that vouches for it, passed through
   * by a server that has never read it and could not usefully check it. What to
   * make of it is `evaluateMemberKeys` in `@gryt/crypto` — the same decision the
   * desktop client runs.
   *
   * Null for anybody who has not published one, which is every client older
   * than this and everybody on a server that has not been updated. No binding
   * means no encrypted message, which is where everybody started.
   */
  dmKeyBinding?: string | null;
  /** Their uploaded picture, or null for the generated face. */
  avatarFileId?: string | null;
  status?: UserStatus;
  role?: string;
  /**
   * The SFU stream this person is publishing, or "" when they are not in a call.
   *
   * **The only mapping there is from a voice stream back to a person.**
   * `@gryt/voice`'s `StreamData` is `{stream, isLocal, kind}` and carries no
   * identity at all, so without this a remote tile can say somebody is here and
   * not who. GRYT-452 recorded that as a boundary; this is the far side of it.
   */
  streamID?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  /**
   * Muted or deafened *by a moderator*, which is a different fact from the two
   * above and outlives leaving the call.
   *
   * Read to label the sheet: an action that says Mute on somebody already
   * server-muted does nothing and reads as broken. Both are in the member
   * list's dedupe hash on the server, so a change here repaints the row.
   */
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  voiceChannelId?: string;
}

/** Derived by the server from what you are doing. There is no manual picker. */
export type UserStatus = "online" | "in_voice" | "afk" | "offline";
