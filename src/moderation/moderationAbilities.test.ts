import { describe, expect, it } from "vitest";

import {
  BUILT_IN_RANK,
  moderationAbilities,
  outranks,
  rankOf,
  type RoleDefinition,
} from "./moderationAbilities";

const DEFS: RoleDefinition[] = [
  { id: "owner", rank: 100 },
  { id: "mod", rank: 60 },
  { id: "member", rank: 40 },
];

/** Everything allowed, so a case is only testing rank. */
const all = () => true;
/** Nothing allowed, so a case is only testing the permission. */
const none = () => false;
const only = (...permissions: string[]) => (p: string) => permissions.includes(p);

describe("rankOf", () => {
  it("prefers the server's definition over the built-in", () => {
    expect(rankOf("mod", [{ id: "mod", rank: 5 }])).toBe(5);
    expect(BUILT_IN_RANK.mod).toBe(60);
  });

  it("falls back to the built-in rank for a role the server has not defined", () => {
    expect(rankOf("admin", DEFS)).toBe(80);
  });

  it("gives an unknown role the bottom rank rather than a middling one", () => {
    expect(rankOf("archivist", DEFS)).toBe(-1);
    expect(rankOf(null, DEFS)).toBe(-1);
  });
});

describe("outranks", () => {
  it("is true only when strictly above", () => {
    expect(outranks("owner", "mod", DEFS)).toBe(true);
    expect(outranks("mod", "owner", DEFS)).toBe(false);
  });

  it("refuses equal ranks, so two mods cannot act on each other", () => {
    expect(outranks("mod", "mod", DEFS)).toBe(false);
  });

  it("refuses when either role is unknown", () => {
    expect(outranks(null, "member", DEFS)).toBe(false);
    expect(outranks("owner", undefined, DEFS)).toBe(false);
  });
});

describe("moderationAbilities", () => {
  it("offers nothing to somebody who cannot outrank them, whatever they hold", () => {
    const abilities = moderationAbilities({
      myRole: "mod", targetRole: "owner", roles: DEFS, can: all,
    });
    expect(abilities).toEqual({
      canMute: false, canDeafen: false, canKick: false, canBan: false, any: false,
    });
  });

  it("offers nothing to somebody with the rank and none of the permissions", () => {
    const abilities = moderationAbilities({
      myRole: "owner", targetRole: "member", roles: DEFS, can: none,
    });
    expect(abilities.any).toBe(false);
  });

  it("offers exactly the permissions held", () => {
    const abilities = moderationAbilities({
      myRole: "mod",
      targetRole: "member",
      roles: DEFS,
      can: only("kick_members"),
    });
    expect(abilities).toEqual({
      canMute: false, canDeafen: false, canKick: true, canBan: false, any: true,
    });
  });

  /* The case a four-rung ladder could not express, and the reason this is two
     questions rather than one. */
  it("lets a role that may only mute, only mute", () => {
    const abilities = moderationAbilities({
      myRole: "mod",
      targetRole: "member",
      roles: DEFS,
      can: only("mute_members"),
    });
    expect(abilities.canMute).toBe(true);
    expect(abilities.canKick).toBe(false);
    expect(abilities.canBan).toBe(false);
  });

  it("hides everything while the target's role is still unknown", () => {
    const abilities = moderationAbilities({
      myRole: "owner", targetRole: undefined, roles: DEFS, can: all,
    });
    expect(abilities.any).toBe(false);
  });
});
