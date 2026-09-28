import { describe, expect, it } from "vitest";

import type { ServerInfoDetails } from "../../connection/types";
import { ADMIN_SECTIONS, canOpenServerSettings, visibleAdminSections } from "./sections";

/* Pins the catalogue so an unlisted permission does not default to allowed —
   see `canOnServer`, which treats one outside it as unrefused. */
const CATALOGUE = ["create_invite", "manage_invites", "manage_sidebar", "manage_channels", "manage_emojis", "manage_roles"];

const info = (permissions: string[]): ServerInfoDetails => ({
  permissions,
  permission_catalogue: CATALOGUE,
});

describe("visibleAdminSections", () => {
  it("shows every section on a server that has not sent permissions", () => {
    expect(visibleAdminSections(undefined)).toEqual(ADMIN_SECTIONS);
  });

  it("shows only what this account holds", () => {
    expect(visibleAdminSections(info(["manage_emojis"]))).toEqual(["emojis"]);
  });

  it("shows folders on manage_channels alone, before manage_sidebar existed", () => {
    expect(visibleAdminSections(info(["manage_channels"]))).toEqual(["folders"]);
  });

  it("keeps the desktop's order regardless of the order permissions arrived in", () => {
    expect(visibleAdminSections(info(["manage_roles", "create_invite", "manage_emojis"]))).toEqual([
      "invites",
      "emojis",
      "roles",
    ]);
  });

  it("shows nothing to an account with none of the four", () => {
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
