import { describe, expect, it } from "vitest";

import { flattenSidebar, folderRollups } from "./sidebarTree";

/**
 * A channel is on screen only if a row is drawn for it, so the cases that
 * matter here are the ones that drop a row rather than the ones that move it.
 */

const folder = (id: string, position: number) =>
  ({ id, kind: "folder" as const, label: id, position });

const channel = (id: string, position: number, parentItemId: string | null = null) =>
  ({ id, kind: "channel" as const, channelId: `chan-${id}`, position, parentItemId });

const ids = (rows: ReturnType<typeof flattenSidebar>) => rows.map((r) => r.item.id);

describe("flattenSidebar", () => {
  it("puts a folder's channels under it, whatever the raw positions say", () => {
    const rows = flattenSidebar([
      channel("a", 10),
      folder("f", 20),
      channel("inside", 90, "f"),
      channel("b", 30),
    ]);
    expect(ids(rows)).toEqual(["a", "f", "inside", "b"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 1, 0]);
  });

  /*
   * The phone can hold a server:details from before a folder was deleted. A
   * channel that disappeared because of it would look deleted, so it comes back
   * to the top level instead.
   */
  it("keeps an orphan, at the top level", () => {
    const rows = flattenSidebar([channel("lost", 10, "gone")]);
    expect(ids(rows)).toEqual(["lost"]);
    expect(rows[0].depth).toBe(0);
  });

  it("treats a parent that is not a folder the same way", () => {
    const rows = flattenSidebar([channel("host", 10), channel("lost", 20, "host")]);
    expect(rows.map((r) => r.depth)).toEqual([0, 0]);
  });

  it("hides the children of a collapsed folder and nothing else", () => {
    const items = [folder("f", 10), channel("x", 20, "f"), channel("y", 30)];
    expect(ids(flattenSidebar(items, new Set(["f"])))).toEqual(["f", "y"]);
    expect(ids(flattenSidebar(items))).toEqual(["f", "x", "y"]);
  });

  it("leaves separators and spacers at the top level even if they claim a parent", () => {
    const items = [
      folder("f", 10),
      { id: "s", kind: "separator" as const, label: "Rules", position: 20, parentItemId: "f" },
    ];
    expect(flattenSidebar(items).map((r) => r.depth)).toEqual([0, 0]);
  });
});

describe("folderRollups", () => {
  /* A shut folder is the only row its channels have, so an unread mention
     inside one has to reach the surface or collapsing a folder mutes it. */
  it("adds up the mentions of the channels inside", () => {
    const items = [folder("f", 10), channel("a", 20, "f"), channel("b", 30, "f")];
    const rollups = folderRollups(items, { "chan-a": 2, "chan-b": 3 });
    expect(rollups.get("f")).toEqual({ children: 2, mentions: 5 });
  });

  it("counts nothing for a folder that is empty", () => {
    expect(folderRollups([folder("f", 10)], {}).get("f")).toBeUndefined();
  });

  it("ignores a channel whose folder does not exist", () => {
    expect(folderRollups([channel("a", 10, "gone")], { "chan-a": 4 }).size).toBe(0);
  });
});
