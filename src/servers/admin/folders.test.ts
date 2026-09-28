import { describe, expect, it } from "vitest";

import {
  channelIdsInFolder,
  folderDeleteImpact,
  folderRows,
  folderUpsertPayload,
  moveChannelPayload,
  nextPosition,
  type SidebarItemLike,
} from "./folders";

const items: SidebarItemLike[] = [
  { id: "f1", kind: "folder", label: "Team", position: 10 },
  { id: "sb_ch_a", kind: "channel", channelId: "a", position: 20, parentItemId: "f1" },
  { id: "sb_ch_b", kind: "channel", channelId: "b", position: 30, parentItemId: "f1" },
  { id: "f2", kind: "folder", label: "Games", position: 40 },
  { id: "sb_ch_c", kind: "channel", channelId: "c", position: 50 },
];

describe("folderRows", () => {
  it("keeps only folders, ordered by position", () => {
    expect(folderRows(items).map((i) => i.id)).toEqual(["f1", "f2"]);
  });

  it("breaks a tie on id", () => {
    const tied: SidebarItemLike[] = [
      { id: "b", kind: "folder", position: 5 },
      { id: "a", kind: "folder", position: 5 },
    ];
    expect(folderRows(tied).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("nextPosition", () => {
  it("goes past the highest position seen", () => {
    expect(nextPosition(items)).toBe(60);
  });

  it("starts at 10 for an empty sidebar", () => {
    expect(nextPosition([])).toBe(10);
  });
});

describe("channelIdsInFolder", () => {
  it("finds channels parented to the folder, in position order", () => {
    expect(channelIdsInFolder(items, "f1")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty folder", () => {
    expect(channelIdsInFolder(items, "f2")).toEqual([]);
  });

  it("never counts a top-level channel", () => {
    expect(channelIdsInFolder(items, "f1")).not.toContain("c");
  });
});

describe("folderUpsertPayload", () => {
  it("carries the position through so an existing folder is not bumped to the top", () => {
    expect(folderUpsertPayload("f1", "Renamed", 10)).toEqual({
      itemId: "f1",
      kind: "folder",
      label: "Renamed",
      position: 10,
    });
  });

  it("falls back to New folder for a blank name", () => {
    expect(folderUpsertPayload("f9", "   ", 10).label).toBe("New folder");
  });

  it("trims the name", () => {
    expect(folderUpsertPayload("f9", "  Team  ", 10).label).toBe("Team");
  });
});

describe("moveChannelPayload", () => {
  it("keeps the item's own position while changing its parent", () => {
    const item: SidebarItemLike = { id: "sb_ch_c", kind: "channel", channelId: "c", position: 50 };
    expect(moveChannelPayload(item, "f1")).toEqual({
      itemId: "sb_ch_c",
      kind: "channel",
      channelId: "c",
      position: 50,
      parentItemId: "f1",
    });
  });

  it("moves out with a null parent", () => {
    const item: SidebarItemLike = { id: "sb_ch_a", kind: "channel", channelId: "a", position: 20, parentItemId: "f1" };
    expect(moveChannelPayload(item, null).parentItemId).toBeNull();
  });

  it("defaults a missing position to 0 rather than sending undefined", () => {
    const item: SidebarItemLike = { id: "x", kind: "channel", channelId: "x" };
    expect(moveChannelPayload(item, null).position).toBe(0);
  });
});

describe("folderDeleteImpact", () => {
  it("says nothing is in an empty folder", () => {
    expect(folderDeleteImpact(items, "f2")).toBe("Nothing is in this folder.");
  });

  it("counts what moves to the top level", () => {
    expect(folderDeleteImpact(items, "f1")).toBe("2 channels will move to the top level.");
  });

  it("uses the singular for one", () => {
    const one = items.filter((i) => i.id !== "sb_ch_b");
    expect(folderDeleteImpact(one, "f1")).toBe("1 channel will move to the top level.");
  });
});
