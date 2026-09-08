import type { ServerInfoDetails } from "./types";

/**
 * What a server knew before it published a catalogue, used as the catalogue it did not
 * send. Frozen, and kept in step with the web client's `socket/src/lib/permissions.ts`.
 */
export const PERMISSIONS_BEFORE_CATALOGUE: readonly string[] = [
  "send_messages",
  "attach_files",
  "add_reactions",
  "join_voice",
  "speak",
  "share_video",
  "share_screen",
  "change_nickname",
  "change_avatar",
  "create_invite",
  "manage_invites",
  "manage_messages",
  "kick_members",
  "ban_members",
  "mute_members",
  "manage_reports",
  "manage_join_requests",
  "manage_channels",
  "manage_emojis",
  "manage_webhooks",
  "manage_roles",
  "manage_server",
  "view_audit_log",
];

/**
 * Whether to offer something, given what the server said. True where it has not said no:
 * no list at all, or a permission outside its catalogue. The server still enforces it.
 */
export function canOnServer(
  info: ServerInfoDetails | undefined,
  permission: string,
): boolean {
  const mine = info?.permissions;
  if (!Array.isArray(mine)) return true;
  if (mine.includes(permission)) return true;

  const catalogue = Array.isArray(info?.permission_catalogue)
    ? info.permission_catalogue
    : PERMISSIONS_BEFORE_CATALOGUE;
  return !catalogue.includes(permission);
}
