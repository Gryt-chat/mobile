import { canOnServer } from "../../connection/permissions";
import type { ServerInfoDetails } from "../../connection/types";

/**
 * The four server settings sections the phone knows how to draw. Kept in the
 * desktop's own order — Invites, then Members' folders, then Emojis, then Roles.
 */
export type AdminSection = "invites" | "folders" | "emojis" | "roles";

/** One of the permissions that opens each section, the same way the desktop's
    settings dialog decides which tabs to draw. */
const SECTION_PERMISSIONS: Record<AdminSection, string[]> = {
  invites: ["create_invite", "manage_invites"],
  // `manage_sidebar` is what the server checks; it ships granted alongside
  // `manage_channels` for anyone who already had that, so an older grant still works.
  folders: ["manage_sidebar", "manage_channels"],
  emojis: ["manage_emojis"],
  roles: ["manage_roles"],
};

export const ADMIN_SECTIONS: AdminSection[] = ["invites", "folders", "emojis", "roles"];

/** Which sections this account may open, in the order they are drawn. */
export function visibleAdminSections(info: ServerInfoDetails | undefined): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) =>
    SECTION_PERMISSIONS[section].some((permission) => canOnServer(info, permission)),
  );
}

/** Whether "Server settings" is worth showing at all. */
export function canOpenServerSettings(info: ServerInfoDetails | undefined): boolean {
  return visibleAdminSections(info).length > 0;
}
