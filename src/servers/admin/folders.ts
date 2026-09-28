/**
 * Payloads for `server:sidebar:item:upsert`/`:delete`. Position is always sent —
 * the server defaults a missing one to 0, bumping a renamed folder to the top.
 */

export interface SidebarItemLike {
  id: string;
  kind: "channel" | "separator" | "spacer" | "folder";
  position?: number | null;
  channelId?: string | null;
  label?: string | null;
  parentItemId?: string | null;
}

/** Every folder, in the order they are drawn. */
export function folderRows(items: SidebarItemLike[]): SidebarItemLike[] {
  return items
    .filter((i) => i.kind === "folder")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
}

/** Where a new top-level item goes: past everything already there. */
export function nextPosition(items: SidebarItemLike[]): number {
  const max = items.reduce((top, i) => Math.max(top, i.position ?? 0), 0);
  return max + 10;
}

/** The channel ids currently sitting in one folder. */
export function channelIdsInFolder(items: SidebarItemLike[], folderId: string): string[] {
  return items
    .filter((i) => i.kind === "channel" && i.parentItemId === folderId && i.channelId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((i) => i.channelId as string);
}

/** The payload for `server:sidebar:item:upsert`, minus `accessToken`, to create or
    rename a folder. Position is required so an existing one is not bumped to 0. */
export function folderUpsertPayload(
  itemId: string,
  label: string,
  position: number,
): { itemId: string; kind: "folder"; label: string; position: number } {
  return { itemId, kind: "folder", label: label.trim() || "New folder", position };
}

/** The payload to move one channel into a folder, or to `null` for out of every
    folder — the channel's own sidebar row, upserted with a new parent. */
export function moveChannelPayload(
  item: SidebarItemLike,
  parentItemId: string | null,
): {
  itemId: string;
  kind: "channel";
  channelId: string;
  position: number;
  parentItemId: string | null;
} {
  return {
    itemId: item.id,
    kind: "channel",
    channelId: item.channelId ?? item.id,
    position: item.position ?? 0,
    parentItemId,
  };
}

/** What deleting a folder does — nothing to its channels, which the phone's copy
    should say plainly rather than implying the folder takes them with it. */
export function folderDeleteImpact(items: SidebarItemLike[], folderId: string): string {
  const count = channelIdsInFolder(items, folderId).length;
  if (count === 0) return "Nothing is in this folder.";
  return `${count} channel${count === 1 ? "" : "s"} will move to the top level.`;
}
