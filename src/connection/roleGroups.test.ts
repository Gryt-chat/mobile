import { describe, expect, it } from "vitest";

import { groupMembersByRole, type RoleSummary } from "./roleGroups";
import type { Member } from "./types";

const ROLES: RoleSummary[] = [
  { id: "owner", name: "Owner", rank: 100, color: "#df6862" },
  { id: "mod", name: "Moderator", rank: 50, color: null },
  { id: "member", name: "Member", rank: 10, color: null },
  { id: "ghost", name: "Ghost", rank: 5, color: null },
];

function member(nickname: string, role: string, status: Member["status"] = "online"): Member {
  return { serverUserId: `u_${nickname}`, nickname, role, status } as Member;
}

describe("grouping the member list by role", () => {
  it("runs highest rank first", () => {
    const groups = groupMembersByRole(
      [member("Mia", "member"), member("Ada", "owner"), member("Tor", "mod")],
      ROLES,
    );
    expect(groups.map((g) => g.title)).toEqual(["Owner", "Moderator", "Member"]);
  });

  it("leaves out a role nobody holds", () => {
    // Fifteen roles and four people online should be four headings, not fifteen.
    const groups = groupMembersByRole([member("Ada", "owner")], ROLES);
    expect(groups.map((g) => g.key)).toEqual(["owner"]);
  });

  it("takes offline out of its role", () => {
    // The rule worth stating: a moderator who is asleep is not an answer to
    // "who is around", so they leave Moderator rather than sitting at the
    // bottom of it.
    const groups = groupMembersByRole(
      [member("Tor", "mod", "offline"), member("Ada", "owner")],
      ROLES,
    );
    expect(groups.map((g) => g.title)).toEqual(["Owner", "Offline"]);
    expect(groups[1].members.map((m) => m.nickname)).toEqual(["Tor"]);
  });

  it("treats an absent status as offline", () => {
    // Built without the helper: passing `undefined` to a parameter with a
    // default gets the default, so the helper cannot express "no status" and
    // this is the case a server that sent none produces.
    const noStatus = { serverUserId: "u_nil", nickname: "Nil", role: "mod" } as Member;
    const groups = groupMembersByRole([noStatus], ROLES);
    expect(groups.map((g) => g.title)).toEqual(["Offline"]);
  });

  it("sorts each group by name, ignoring case", () => {
    const groups = groupMembersByRole(
      [member("zoe", "member"), member("Ada", "member"), member("bo", "member")],
      ROLES,
    );
    expect(groups[0].members.map((m) => m.nickname)).toEqual(["Ada", "bo", "zoe"]);
  });

  it("puts a role the server never described after the named ones", () => {
    const groups = groupMembersByRole(
      [member("Ada", "owner"), member("Rem", "deleted-role")],
      ROLES,
    );
    expect(groups.map((g) => g.title)).toEqual(["Owner", "Everyone else"]);
  });

  it("calls the group Members when there are no named ones at all", () => {
    // What a server too old to send roles looks like: one list, not a blank
    // heading over everybody.
    const groups = groupMembersByRole([member("Ada", "member"), member("Bo", "member")], []);
    expect(groups.map((g) => g.title)).toEqual(["Members"]);
    expect(groups[0].members).toHaveLength(2);
  });

  it("carries the role's colour", () => {
    const groups = groupMembersByRole([member("Ada", "owner")], ROLES);
    expect(groups[0].color).toBe("#df6862");
  });

  it("says nothing when nobody is there", () => {
    expect(groupMembersByRole([], ROLES)).toEqual([]);
  });
});
