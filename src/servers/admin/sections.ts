import { canOnServer } from "../../connection/permissions";
import type { ServerInfoDetails } from "../../connection/types";

/** The desktop's server settings tabs the phone has screens for, in its order. */
export type AdminSection = "invites" | "roles" | "emoji" | "moderation" | "hosting";

export type AdminPage = { key: string; label: string; hint: string; route: string; needs: string[] };

/** What opens under each tab. Any one of `needs` is enough, like the desktop's tabs. */
export const SECTION_PAGES: Record<AdminSection, AdminPage[]> = {
  invites: [{ key: "invites", label: "Invites", hint: "Codes that let people in", route: "/server-settings/invites", needs: ["create_invite", "manage_invites"] }],
  roles: [
    { key: "roles", label: "Roles", hint: "What each role may do", route: "/server-settings/roles", needs: ["manage_roles"] },
    { key: "channels", label: "Channel permissions", hint: "Templates for who can use a channel", route: "/permissions", needs: ["manage_roles"] },
    // `manage_sidebar` is what the server checks; `manage_channels` is the older grant.
    { key: "folders", label: "Folders", hint: "Group channels, and who can use them", route: "/server-settings/folders", needs: ["manage_sidebar", "manage_channels"] },
  ],
  emoji: [{ key: "emoji", label: "Emoji", hint: "This server's own emoji", route: "/server-settings/emojis", needs: ["manage_emojis"] }],
  moderation: [{ key: "bans", label: "Bans", hint: "Who's banned, and lifting a ban", route: "/bans", needs: ["view_bans", "ban_members"] }],
  hosting: [{ key: "storage", label: "Storage", hint: "What takes space, and deleting files", route: "/server-settings/storage", needs: ["manage_server"] }],
};

export const ADMIN_SECTIONS = Object.keys(SECTION_PAGES) as AdminSection[];

const CLOUD_PAGE: AdminPage = { key: "cloud", label: "Gryt Cloud", hint: "Plan, storage and transfer", route: "/server-settings/cloud", needs: [] };

/** The pages under one tab this account may open. Gryt Cloud leads Hosting on a Cloud server. */
export function visiblePages(section: AdminSection, info: ServerInfoDetails | undefined, cloud = false): AdminPage[] {
  const pages = SECTION_PAGES[section].filter((p) => p.needs.some((permission) => canOnServer(info, permission)));
  return section === "hosting" && cloud ? [CLOUD_PAGE, ...pages] : pages;
}

/** Which tabs this account may open, in the order they are drawn. */
export function visibleAdminSections(info: ServerInfoDetails | undefined, cloud = false): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => visiblePages(section, info, cloud).length > 0);
}

/** Whether "Server settings" is worth showing at all. */
export function canOpenServerSettings(info: ServerInfoDetails | undefined): boolean {
  return visibleAdminSections(info).length > 0;
}
