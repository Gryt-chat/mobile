import { describe, expect, it } from "vitest";

import {
  cellState,
  describeDeleteImpact,
  describeRules,
  describeSaveImpact,
  indexRules,
  nextCellState,
  orderRoles,
  permissionLabel,
  withCell,
  type ChannelRule,
} from "./channelRules";

const rules: ChannelRule[] = [
  { roleId: "everyone", permission: "read_messages", effect: "deny" },
  { roleId: "mods", permission: "manage_messages", effect: "allow" },
];

describe("cellState", () => {
  it("reads a rule that is there", () => {
    const index = indexRules(rules);
    expect(cellState(index, "everyone", "read_messages")).toBe("deny");
    expect(cellState(index, "mods", "manage_messages")).toBe("allow");
  });

  it("calls the absence of a rule inherit", () => {
    expect(cellState(indexRules(rules), "mods", "read_messages")).toBe("inherit");
  });

  it("does not confuse two roles with the same permission", () => {
    // The index is keyed by both, and a key built from one of them would make
    // every role in a column read the same.
    const index = indexRules([
      { roleId: "a", permission: "speak", effect: "deny" },
      { roleId: "b", permission: "speak", effect: "allow" },
    ]);
    expect(cellState(index, "a", "speak")).toBe("deny");
    expect(cellState(index, "b", "speak")).toBe("allow");
  });
});

describe("nextCellState", () => {
  it("offers deny before allow", () => {
    // Deliberate, and the web client does the same. A test rather than a
    // comment because reversing it is a one-character change that reads fine.
    expect(nextCellState("inherit")).toBe("deny");
  });

  it("comes back round to inherit", () => {
    expect(nextCellState(nextCellState(nextCellState("inherit")))).toBe("inherit");
  });
});

describe("withCell", () => {
  it("adds a rule that was not there", () => {
    const next = withCell([], "mods", "speak", "allow");
    expect(next).toEqual([{ roleId: "mods", permission: "speak", effect: "allow" }]);
  });

  it("replaces rather than duplicating", () => {
    const next = withCell(rules, "everyone", "read_messages", "allow");
    expect(next.filter((r) => r.roleId === "everyone" && r.permission === "read_messages")).toEqual([
      { roleId: "everyone", permission: "read_messages", effect: "allow" },
    ]);
  });

  it("removes the row when a cell goes back to inherit", () => {
    // The save replaces the whole set, so a row left behind here is a rule the
    // server keeps. Inherit has to be an absence or it is unreachable.
    const next = withCell(rules, "everyone", "read_messages", "inherit");
    expect(next.some((r) => r.roleId === "everyone" && r.permission === "read_messages")).toBe(false);
    expect(next).toHaveLength(1);
  });

  it("leaves the other rules alone", () => {
    const next = withCell(rules, "everyone", "read_messages", "inherit");
    expect(next).toContainEqual({ roleId: "mods", permission: "manage_messages", effect: "allow" });
  });
});

describe("orderRoles", () => {
  it("puts low rank first", () => {
    const ordered = orderRoles([
      { id: "owner", rank: 100 },
      { id: "everyone", rank: 0 },
      { id: "mod", rank: 50 },
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["everyone", "mod", "owner"]);
  });

  it("does not sort the array it was given", () => {
    const roles = [{ id: "owner", rank: 100 }, { id: "everyone", rank: 0 }];
    orderRoles(roles);
    expect(roles.map((r) => r.id)).toEqual(["owner", "everyone"]);
  });
});

describe("describeRules", () => {
  const names = new Map([
    ["everyone", "Everyone"],
    ["guests", "Guests"],
    ["mods", "Moderators"],
  ]);

  it("says so when a template changes nothing", () => {
    expect(describeRules([], names)).toBe("Changes nothing yet.");
  });

  it("names who cannot see the channel", () => {
    expect(describeRules([{ roleId: "guests", permission: "read_messages", effect: "deny" }], names))
      .toBe("Guests cannot see the channel at all.");
  });

  it("joins several hidden roles", () => {
    const hidden: ChannelRule[] = [
      { roleId: "guests", permission: "read_messages", effect: "deny" },
      { roleId: "everyone", permission: "read_messages", effect: "deny" },
    ];
    expect(describeRules(hidden, names)).toBe("Guests and Everyone cannot see the channel at all.");
  });

  it("counts the rest separately from the hiding", () => {
    const mixed: ChannelRule[] = [
      { roleId: "guests", permission: "read_messages", effect: "deny" },
      { roleId: "guests", permission: "speak", effect: "deny" },
    ];
    expect(describeRules(mixed, names)).toBe(
      "Guests cannot see the channel at all, and 1 other change.",
    );
  });

  it("does not call an allowed read a hiding", () => {
    // Only a denial hides. An explicit allow on read_messages is a role being
    // let back in, and reporting it as hidden would be backwards.
    expect(describeRules([{ roleId: "guests", permission: "read_messages", effect: "allow" }], names))
      .toBe("0 changes to what roles can do.");
  });

  it("falls back to the role id when the name is unknown", () => {
    expect(describeRules([{ roleId: "ghost", permission: "read_messages", effect: "deny" }], names))
      .toBe("ghost cannot see the channel at all.");
  });
});

describe("describeSaveImpact", () => {
  it("says nothing when no channel uses the template", () => {
    expect(describeSaveImpact(0)).toBeNull();
  });

  it("names the count and the eviction", () => {
    expect(describeSaveImpact(1)).toContain("1 channel.");
    expect(describeSaveImpact(9)).toContain("9 channels.");
    expect(describeSaveImpact(9)).toContain("voice room");
  });
});

describe("describeDeleteImpact", () => {
  it("does not warn about eviction", () => {
    // Deleting only widens access, so nobody is thrown out of a voice room.
    // Saying they might be would be a warning about something that cannot
    // happen, and people stop reading those.
    expect(describeDeleteImpact(4)).not.toContain("voice");
    expect(describeDeleteImpact(4)).toBe("4 channels will go back to being open to everyone.");
  });

  it("says when nothing is using it", () => {
    expect(describeDeleteImpact(0)).toBe("No channel is using this template.");
  });
});

describe("permissionLabel", () => {
  it("labels the ones this build knows", () => {
    expect(permissionLabel("read_messages")).toBe("Read messages");
  });

  it("falls back to the id for a permission it has never heard of", () => {
    // The server sends the list, so a newer server can name one this build has
    // no label for. Showing the id keeps the row settable; hiding it would let
    // the save clear a rule nobody was shown.
    expect(permissionLabel("send_stickers")).toBe("send_stickers");
  });
});
