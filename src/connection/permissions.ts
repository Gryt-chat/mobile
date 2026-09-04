import type { ServerInfoDetails } from "./types";

/**
 * What a server knew about before it published a catalogue.
 *
 * A server from the first release of this feature sends the caller's
 * permissions and no list of what it has heard of, so an absence there is
 * ambiguous. This is the list it must have had, used as the catalogue it did
 * not send — anything outside it is a permission that build could not have
 * been withholding.
 *
 * Frozen. It describes a release that has already happened, so it never grows.
 * Kept in step with the web client's copy in
 * `packages/socket/src/lib/permissions.ts`; the two describe the same past.
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
 * Whether to offer something, given what the server said about this account.
 *
 * True in the two cases where the server has not actually said no: a server
 * that sent no permission list at all, and a permission missing from the
 * server's own catalogue, which means that build has never heard of it and
 * cannot be withholding it.
 *
 * The second case matters here rather than being a nicety: this app learns
 * about `send_direct_messages` before most servers running today have, and
 * reading its absence as a denial would hide messaging on every server where it
 * works.
 *
 * The server enforces this. The client is only deciding what to offer, so
 * leaning towards offering is the safe direction.
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
