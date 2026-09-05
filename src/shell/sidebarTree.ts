import type { SidebarItem } from "../connection/types";

/**
 * Flat sidebar to drawn order, the phone's half of the desktop's `sidebarTree`.
 *
 * Only the reading half. There is no drag reordering here, so nothing needs to
 * work out what a drop meant — a folder is arranged on the desktop and shown
 * here.
 */

export interface SidebarRow {
  item: SidebarItem;
  /** 0 at the top level, 1 inside a folder. There is no 2. */
  depth: 0 | 1;
}

const byPosition = (a: SidebarItem, b: SidebarItem) =>
  (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id);

/**
 * The folder this item is really in, which is not always the one it names.
 *
 * A channel pointing at a folder that is not in the list is an orphan and goes
 * to the top level. That happens for real: the phone can be holding a
 * `server:details` from before somebody deleted a folder, and a channel that
 * vanished because of it would look like a channel that had been deleted.
 */
function effectiveParent(item: SidebarItem, folders: Set<string>): string | null {
  if (item.kind !== "channel") return null;
  const parent = item.parentItemId ?? null;
  return parent && folders.has(parent) ? parent : null;
}

/**
 * Top-level items in position order, each folder followed by its own children.
 *
 * `collapsed` leaves a folder's children out. They keep their membership; this
 * only decides what is drawn.
 */
export function flattenSidebar(
  items: SidebarItem[],
  collapsed: ReadonlySet<string> = new Set(),
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
    rows.push({ item, depth: 0 });
    if (item.kind !== "folder" || collapsed.has(item.id)) continue;
    for (const child of (children.get(item.id) ?? []).sort(byPosition)) {
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
