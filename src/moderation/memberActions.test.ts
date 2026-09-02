import { describe, expect, it } from "vitest";

import { dangerIndices, memberActions } from "./memberActions";
import type { RoleDefinition } from "./moderationAbilities";

const DEFS: RoleDefinition[] = [
  { id: "owner", rank: 100 },
  { id: "mod", rank: 60 },
  { id: "member", rank: 40 },
];

const all = () => true;
const none = () => false;
const only = (...permissions: string[]) => (p: string) => permissions.includes(p);

const kinds = (args: Parameters<typeof memberActions>[0]) =>
  memberActions(args).map((a) => a.kind);

describe("memberActions", () => {
  it("offers only blocking to somebody with no permissions", () => {
    expect(kinds({ name: "Ada", myRole: "member", targetRole: "member", roles: DEFS, can: none }))
      .toEqual(["block"]);
  });

  it("puts blocking last, after every moderator action", () => {
    expect(kinds({ name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: all }))
      .toEqual(["mute", "deafen", "kick", "ban", "block"]);
  });

  it("says unblock instead when they already are", () => {
    expect(kinds({
      name: "Ada", myRole: "member", targetRole: "member", roles: DEFS, can: none, isBlocked: true,
    })).toEqual(["unblock"]);
  });

  it("offers the reverse of the state somebody is already in", () => {
    expect(kinds({
      name: "Ada",
      myRole: "owner",
      targetRole: "member",
      roles: DEFS,
      can: only("mute_members", "deafen_members"),
      isServerMuted: true,
      isServerDeafened: true,
    })).toEqual(["unmute", "undeafen", "block"]);
  });

  /*
   * The reason this is a separate module. A moderator who may kick but not
   * mute sees a shorter list, and "the second row" is a different act for them
   * than for somebody who may do both. Nothing may assume a fixed position.
   */
  it("keeps each label attached to its own act as options drop out", () => {
    const full = memberActions({
      name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: all,
    });
    const kickOnly = memberActions({
      name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: only("kick_members"),
    });

    expect(full[2].kind).toBe("kick");
    expect(kickOnly[0].kind).toBe("kick");
    expect(kickOnly.map((a) => a.kind)).toEqual(["kick", "block"]);
  });

  it("never offers a moderator action against somebody who outranks you", () => {
    expect(kinds({ name: "Ada", myRole: "mod", targetRole: "owner", roles: DEFS, can: all }))
      .toEqual(["block"]);
  });

  it("names the person in every label", () => {
    const actions = memberActions({
      name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: all,
    });
    expect(actions.every((a) => a.label.includes("Ada"))).toBe(true);
  });
});

describe("dangerIndices", () => {
  it("marks kick, ban and block, and nothing else", () => {
    const actions = memberActions({
      name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: all,
    });
    expect(dangerIndices(actions)).toEqual([2, 3, 4]);
    expect(actions.filter((a) => a.danger).map((a) => a.kind)).toEqual(["kick", "ban", "block"]);
  });

  it("does not mark undoing something as destructive", () => {
    const actions = memberActions({
      name: "Ada",
      myRole: "member",
      targetRole: "member",
      roles: DEFS,
      can: none,
      isBlocked: true,
    });
    expect(dangerIndices(actions)).toEqual([]);
  });
});
