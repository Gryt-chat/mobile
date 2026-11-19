import { describe, expect, it } from "vitest";

import type { ServerInfoDetails } from "../../connection/types";
import { ADMIN_SECTIONS, canOpenServerSettings, visibleAdminSections, visiblePages } from "./sections";

/* Pins the catalogue so an unlisted permission does not default to allowed —
   see `canOnServer`, which treats one outside it as unrefused. */
const CATALOGUE = ["manage_server", "create_invite", "manage_invites", "manage_sidebar", "manage_channels", "manage_emojis", "manage_roles", "view_bans", "ban_members"];

const info = (permissions: string[]): ServerInfoDetails => ({
  permissions,
  permission_catalogue: CATALOGUE,
});

describe("visibleAdminSections", () => {
  it("shows every section on a server that has not sent permissions", () => {
    expect(visibleAdminSections(undefined)).toEqual(ADMIN_SECTIONS);
  });

  it("shows only what this account holds", () => {
    expect(visibleAdminSections(info(["manage_emojis"]))).toEqual(["emoji"]);
  });

  it("puts folders under Roles, on manage_channels alone too", () => {
    expect(visibleAdminSections(info(["manage_channels"]))).toEqual(["roles"]);
    expect(visiblePages("roles", info(["manage_channels"])).map((p) => p.key)).toEqual(["folders"]);
  });

  it("keeps the desktop's order regardless of the order permissions arrived in", () => {
    expect(visibleAdminSections(info(["view_bans", "manage_roles", "create_invite", "manage_emojis"]))).toEqual([
      "invites",
      "roles",
      "emoji",
      "moderation",
    ]);
  });

  it("shows Hosting for a Cloud server without manage_server", () => {
    expect(visibleAdminSections(info(["send_messages"]), true)).toEqual(["hosting"]);
    expect(visiblePages("hosting", info(["manage_server"]), true).map((p) => p.key)).toEqual(["cloud", "storage"]);
  });

  it("shows nothing to an account with none of them", () => {
    expect(visibleAdminSections(info(["send_messages"]))).toEqual([]);
  });
});

describe("canOpenServerSettings", () => {
  it("is false with no qualifying permission", () => {
    expect(canOpenServerSettings(info(["send_messages"]))).toBe(false);
  });

  it("is true with at least one", () => {
    expect(canOpenServerSettings(info(["ban_members", "create_invite"]))).toBe(true);
  });
});
