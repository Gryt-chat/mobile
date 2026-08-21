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
  }[];
}

export interface ChatHistory {
  conversation_id: string;
  items: Message[];
  hasMore: boolean;
  /** Echoed back when the request carried one, so a page can be matched to it. */
  before?: string;
}
