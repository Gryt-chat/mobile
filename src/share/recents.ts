/**
 * The channels you last said something in.
 *
 * Sharing a picture into Gryt from Photos means answering "where?", and the
 * honest answer for almost everybody is "the same place as last time". Making
 * that a list, newest first, turns the common case into one tap and leaves the
 * uncommon one no worse than a full server-then-channel walk would have been.
 *
 * **Recorded on send, not on open.** Opening a channel to read it says nothing
 * about where you would post — the busiest channel to read is often the one you
 * never write in. What this list is for is finding the place you talk.
 *
 * Pure, and separate from the storage, so the rules can be tested: dedup,
 * ordering and the cap are the whole of the behaviour and none of them need a
 * device.
 */

export interface RecentChannel {
  host: string;
  channelId: string;
  /**
   * Cached names, not authoritative.
   *
   * The picker has to draw this list before it has connected to anything — that
   * is the entire point of it being fast — so a channel renamed since the last
   * send shows its old name once and corrects itself after the next one. The
   * server list stores its `name` for the same reason.
   */
  channelName: string;
  serverName: string;
  /** Milliseconds, so it survives JSON without a revive step. */
  at: number;
}

/**
 * How many to keep.
 *
 * Twelve rather than five: a picker is a list you scan, not a menu you learn,
 * and the cost of a longer one is a scroll. Rather than a number chosen to be
 * round, this is roughly how many rows fit on a phone before scrolling — enough
 * that the answer is nearly always on screen.
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
 * Newest first.
 *
 * `remember` already returns them in order, so this is for what comes back off
 * disk: a list written by an older build, or one two writes raced over. Sorting
 * on read is cheaper than trusting the file.
 */
export function rank(list: RecentChannel[]): RecentChannel[] {
  return [...list].sort((a, b) => b.at - a.at);
}

/**
 * Everything belonging to one server, gone.
 *
 * For leaving a server. A recent channel on a server you are no longer in is a
 * row that cannot be tapped — and worse, it is a row naming a place somebody
 * deliberately left, which is not something to keep offering them.
 */
export function forget(list: RecentChannel[], host: string): RecentChannel[] {
  return list.filter((item) => item.host !== host);
}

/**
 * What is safe to draw, out of whatever was on disk.
 *
 * Storage is JSON somebody could have written in an older format, so every
 * field is checked rather than cast. A single bad row drops itself instead of
 * taking the picker down — the list is a convenience, and there is no version
 * of losing it that is worth a crash on launch.
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
