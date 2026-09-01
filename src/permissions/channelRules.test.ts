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
  scopeChoiceFrom,
  scopeSetPayload,
  sameChoice,
  describeChoice,
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

// ── Which scope a channel is pointed at ──────────────────────────────

describe("scopeChoiceFrom", () => {
  it("reads no scope as everyone", () => {
    expect(scopeChoiceFrom(null, false)).toEqual({ kind: "everyone" });
  });

  it("reads a template scope as that template", () => {
    expect(scopeChoiceFrom("scope_abc", true)).toEqual({ kind: "template", templateId: "scope_abc" });
  });

  // A scope that is not a template belongs to this channel alone. Reading it as
  // a template would offer it in a picker and let two channels share what was
  // meant to be private to one.
  it("reads a non-template scope as custom", () => {
    expect(scopeChoiceFrom("scope_abc", false)).toEqual({ kind: "custom" });
  });
});

describe("scopeSetPayload", () => {
  const rules: ChannelRule[] = [{ roleId: "guest", permission: "read_messages", effect: "deny" }];

  it("sends no scope for everyone", () => {
    expect(scopeSetPayload({ kind: "everyone" }, rules)).toEqual({ templateId: null });
  });

  it("sends the rules for custom", () => {
    expect(scopeSetPayload({ kind: "custom" }, rules)).toEqual({ custom: true, rules });
  });

  // The one that matters. A template carries no rules, because writing them
  // would edit the template and change every other channel on it — from a
  // screen showing one channel's name.
  it("never sends rules with a template", () => {
    const payload = scopeSetPayload({ kind: "template", templateId: "scope_x" }, rules);
    expect(payload).toEqual({ templateId: "scope_x" });
    expect(payload.rules).toBeUndefined();
    expect(payload.custom).toBeUndefined();
  });
});

describe("sameChoice", () => {
  it("tells two templates apart", () => {
    expect(sameChoice({ kind: "template", templateId: "a" }, { kind: "template", templateId: "b" })).toBe(false);
    expect(sameChoice({ kind: "template", templateId: "a" }, { kind: "template", templateId: "a" })).toBe(true);
  });

  it("does not confuse everyone with custom", () => {
    expect(sameChoice({ kind: "everyone" }, { kind: "custom" })).toBe(false);
  });
});

describe("describeChoice", () => {
  const names = new Map([["guests", "Guests"]]);

  it("says everyone plainly", () => {
    expect(describeChoice({ kind: "everyone" }, null, [], names)).toContain("Everyone on the server");
  });

  // The warning that matters on this screen: a template is shared, and the
  // person editing one channel needs to know before they pick it.
  it("warns that a template is shared", () => {
    const text = describeChoice({ kind: "template", templateId: "s" }, "Staff only", [], names);
    expect(text).toContain("Staff only");
    expect(text).toContain("every channel");
  });

  it("falls back when the template has no name", () => {
    expect(describeChoice({ kind: "template", templateId: "s" }, null, [], names)).toBe("Follows a template.");
  });

  it("describes custom rules the same way the template list does", () => {
    const rules: ChannelRule[] = [{ roleId: "guests", permission: "read_messages", effect: "deny" }];
    expect(describeChoice({ kind: "custom" }, null, rules, names)).toBe(
      "Guests cannot see the channel at all.",
    );
  });
});
