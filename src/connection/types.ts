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

export interface ChallengePayload {
  nonce: string;
  serverHost: string;
  identityTiers?: ("account" | "local")[];
}

export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting" }
  /** Talking, and the server proved itself (or is old enough not to). */
  | { status: "joining" }
  | { status: "ready"; channels: Channel[]; sidebar: SidebarItem[]; details?: ServerInfoDetails }
  | { status: "refused"; reason: string; detail: string }
  | { status: "error"; message: string };
