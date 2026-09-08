/**
 * The channels you last said something in, because the honest answer to "where?" is
 * usually "the same place as last time". **Recorded on send, not on open.**
 */

export interface RecentChannel {
  host: string;
  channelId: string;
  /**
   * Cached names, not authoritative. The picker draws this before it has connected, so
   * a renamed channel shows its old name once.
   */
  channelName: string;
  serverName: string;
  /** Milliseconds, so it survives JSON without a revive step. */
  at: number;
}

/**
 * How many to keep. Roughly how many rows fit on a phone before scrolling — a
 * picker is a list you scan rather than a menu you learn.
 */
export const MAX_RECENTS = 12;

/** One channel, moved to the front. */
export function remember(list: RecentChannel[], entry: RecentChannel): RecentChannel[] {
  /* Dropped and re-added rather than updated in place, because the names travel
   * with the entry and the newest send has the freshest ones. */
  const without = list.filter(
    (item) => !(item.host === entry.host && item.channelId === entry.channelId),
  );
  return [entry, ...without].slice(0, MAX_RECENTS);
}

/**
 * Newest first. `remember` already returns them in order, so this is for what comes
 * back off disk — sorting on read is cheaper than trusting the file.
 */
export function rank(list: RecentChannel[]): RecentChannel[] {
  return [...list].sort((a, b) => b.at - a.at);
}

/**
 * Everything belonging to one server, gone, for leaving it. A row naming a place
 * somebody deliberately left is not something to keep offering them.
 */
export function forget(list: RecentChannel[], host: string): RecentChannel[] {
  return list.filter((item) => item.host !== host);
}

/**
 * What is safe to draw, out of whatever was on disk. **Every field is checked rather
 * than cast**, and a single bad row drops itself.
 */
export function parseRecents(raw: unknown): RecentChannel[] {
  if (!Array.isArray(raw)) return [];

  const clean: RecentChannel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.host !== "string" || !row.host) continue;
    if (typeof row.channelId !== "string" || !row.channelId) continue;
    if (typeof row.at !== "number" || !Number.isFinite(row.at)) continue;
    clean.push({
      host: row.host,
      channelId: row.channelId,
      channelName: typeof row.channelName === "string" ? row.channelName : "",
      serverName: typeof row.serverName === "string" ? row.serverName : "",
      at: row.at,
    });
  }
  return rank(clean).slice(0, MAX_RECENTS);
}
