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

  it("puts the two personal actions last, after every moderator one", () => {
    expect(kinds({ name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: all }))
      .toEqual(["mute", "deafen", "kick", "ban", "block", "report"]);
  });

  /*
   * The one that must not be gated on rank. Somebody being harassed by the
   * person who runs the server has no moderator to appeal to and every reason
   * to be heard; `moderationAbilities` refuses everything else here, and both
   * of these survive it.
   */
  it("offers blocking and reporting against somebody who outranks you", () => {
    expect(kinds({
      name: "Ada",
      myRole: "member",
      targetRole: "owner",
      roles: DEFS,
      can: only("report_messages"),
    })).toEqual(["block", "report"]);
  });

  it("leaves reporting out of a role that may not report", () => {
    expect(kinds({
      name: "Ada", myRole: "member", targetRole: "member", roles: DEFS, can: none,
    })).toEqual(["block"]);
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

  /* Blocking and reporting survive, and only those. Neither is moderation:
     both are things anybody may do to anybody, which is the whole reason they
     are not gated on rank. */
  it("never offers a moderator action against somebody who outranks you", () => {
    expect(kinds({ name: "Ada", myRole: "mod", targetRole: "owner", roles: DEFS, can: all }))
      .toEqual(["block", "report"]);
  });

  it("names the person in every label", () => {
    const actions = memberActions({
      name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: all,
    });
    expect(actions.every((a) => a.label.includes("Ada"))).toBe(true);
  });
});

describe("dangerIndices", () => {
  it("marks kick, ban, block and report, and nothing else", () => {
    const actions = memberActions({
      name: "Ada", myRole: "owner", targetRole: "member", roles: DEFS, can: all,
    });
    expect(dangerIndices(actions)).toEqual([2, 3, 4, 5]);
    expect(actions.filter((a) => a.danger).map((a) => a.kind)).toEqual([
      "kick", "ban", "block", "report",
    ]);
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
