import { describe, expect, it } from "vitest";

import { byRank, neighborId, OWNER_ROLE, ranksAfterMove, type RankedRole } from "./roleOrder";

const roles: RankedRole[] = [
  { id: "owner", rank: 100 },
  { id: "admin", rank: 50 },
  { id: "mod", rank: 30 },
  { id: "member", rank: 10 },
];

describe("byRank", () => {
  it("sorts highest first", () => {
    expect(byRank(roles).map((r) => r.id)).toEqual(["owner", "admin", "mod", "member"]);
  });

  it("breaks a tie on id", () => {
    expect(byRank([{ id: "b", rank: 5 }, { id: "a", rank: 5 }]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("ranksAfterMove", () => {
  it("does nothing moving a role onto itself", () => {
    expect(ranksAfterMove(roles, "mod", "mod")).toEqual([]);
  });

  it("never moves the owner, even if it is named as the target", () => {
    const changed = ranksAfterMove(roles, "admin", "owner");
    expect(changed.every((r) => r.id !== "owner")).toBe(true);
  });

  it("swaps two roles' order", () => {
    const changed = ranksAfterMove(roles, "member", "mod");
    const byId = new Map(changed.map((r) => [r.id, r.rank]));
    // member now ranks above where mod was, and mod's own rank moved to make room.
    const newMember = byId.get("member");
    const newMod = byId.get("mod") ?? roles.find((r) => r.id === "mod")!.rank;
    expect(newMember).toBeGreaterThan(newMod);
  });

  it("never assigns a rank of 0 or below", () => {
    const many: RankedRole[] = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, rank: 90 - i }));
    const changed = ranksAfterMove(many, "r19", "r0");
    expect(changed.every((r) => r.rank >= 1)).toBe(true);
  });
});

describe("neighborId", () => {
  it("finds the role directly above", () => {
    expect(neighborId(roles, "mod", "up")).toBe("admin");
  });

  it("finds the role directly below", () => {
    expect(neighborId(roles, "mod", "down")).toBe("member");
  });

  it("is null past either end", () => {
    expect(neighborId(roles, "admin", "up")).toBeNull();
    expect(neighborId(roles, "member", "down")).toBeNull();
  });

  it("excludes the owner as a neighbor", () => {
    expect(neighborId(roles, "admin", "up")).not.toBe(OWNER_ROLE);
  });
});
