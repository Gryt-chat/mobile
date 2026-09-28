import { describe, expect, it } from "vitest";

import { slugifyRoleId } from "./roleDraft";

describe("slugifyRoleId", () => {
  it("lower-cases and dashes spaces", () => {
    expect(slugifyRoleId("Community Helper")).toBe("community-helper");
  });

  it("collapses runs of non-alphanumerics into one dash", () => {
    expect(slugifyRoleId("Mods & Admins!!")).toBe("mods-admins");
  });

  it("trims a leading or trailing dash", () => {
    expect(slugifyRoleId("--vip--")).toBe("vip");
  });

  it("caps at 32 characters", () => {
    expect(slugifyRoleId("a".repeat(40)).length).toBe(32);
  });

  it("is empty for a name with nothing keepable", () => {
    expect(slugifyRoleId("!!!")).toBe("");
  });
});
