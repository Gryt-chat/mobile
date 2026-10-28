import type { SidebarItem } from "../connection/types";

/**
 * Flat sidebar to drawn order, the phone's half of the desktop's `sidebarTree`. Only
 * the reading half: a folder is arranged on the desktop and shown here.
 */

export interface SidebarRow {
  item: SidebarItem;
  /** 0 at the top level, 1 inside a folder. There is no 2. */
  depth: 0 | 1;
}

const byPosition = (a: SidebarItem, b: SidebarItem) =>
  (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id);

export interface FlattenOptions {
  /** Leave out a folder with nothing under it. Servers before GRYT-1306 send
      every folder, so one whose channels are all hidden arrives empty. */
  hideEmptyFolders?: boolean;
}

/**
 * The folder this item is really in, which is not always the one it names. An orphan
 * goes to the top level — the phone can hold a `server:details` from before a delete.
 */
function effectiveParent(item: SidebarItem, folders: Set<string>): string | null {
  if (item.kind !== "channel") return null;
  const parent = item.parentItemId ?? null;
  return parent && folders.has(parent) ? parent : null;
}

/**
 * Top-level items in position order, each folder followed by its own children.
 * `collapsed` leaves a folder's children out; they keep their membership.
 */
export function flattenSidebar(
  items: SidebarItem[],
  collapsed: ReadonlySet<string> = new Set(),
  { hideEmptyFolders = false }: FlattenOptions = {},
): SidebarRow[] {
  const folders = new Set(items.filter((i) => i.kind === "folder").map((i) => i.id));
  const children = new Map<string, SidebarItem[]>();
  const top: SidebarItem[] = [];

  for (const item of items) {
    const parent = effectiveParent(item, folders);
    if (parent) {
      const list = children.get(parent) ?? [];
      list.push(item);
      children.set(parent, list);
    } else {
      top.push(item);
    }
  }

  const rows: SidebarRow[] = [];
  for (const item of [...top].sort(byPosition)) {
    const inside = children.get(item.id) ?? [];
    if (item.kind === "folder" && hideEmptyFolders && inside.length === 0) continue;
    rows.push({ item, depth: 0 });
    if (item.kind !== "folder" || collapsed.has(item.id)) continue;
    for (const child of inside.sort(byPosition)) {
      rows.push({ item: child, depth: 1 });
    }
  }
  return rows;
}

/** What a shut folder has to say for the channels it is hiding. */
export interface FolderRollup {
  children: number;
  mentions: number;
}

export function folderRollups(
  items: SidebarItem[],
  mentionCounts: Record<string, number>,
): Map<string, FolderRollup> {
  const folders = new Set(items.filter((i) => i.kind === "folder").map((i) => i.id));
  const rollups = new Map<string, FolderRollup>();

  for (const item of items) {
    const parent = effectiveParent(item, folders);
    if (!parent) continue;
    const entry = rollups.get(parent) ?? { children: 0, mentions: 0 };
    entry.children += 1;
    entry.mentions += mentionCounts[item.channelId ?? item.id] ?? 0;
    rollups.set(parent, entry);
  }
  return rollups;
}

/** A heading (folder, separator or spacer) or a run of channels drawn as one card. */
export type SidebarBlock = { kind: "head"; item: SidebarItem } | { kind: "card"; rows: SidebarItem[] };

/** Rows as cards: a folder's channels are one card, and so is each run of top-level ones. */
export function sidebarBlocks(rows: SidebarRow[]): SidebarBlock[] {
  const blocks: SidebarBlock[] = [];
  let depth = -1;
  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    if (row.item.kind !== "channel") blocks.push({ kind: "head", item: row.item });
    else if (last?.kind === "card" && row.depth === depth) last.rows.push(row.item);
    else blocks.push({ kind: "card", rows: [row.item] });
    depth = row.depth;
  }
  return blocks;
}
