/**
 * How often somebody was named in a conversation and has not read it — apart from the
 * unread count. Every function returns a new object; these run in a state updater.
 */

/** Unseen mentions per conversation, for one server. */
export type MentionCounts = Record<string, number>;

/** Every server's, by host. */
export type MentionsByHost = Record<string, MentionCounts>;

/**
 * Replace one server's counts with what it just told us. Replace rather than merge: a
 * conversation it did not name has been read somewhere else.
 */
export function applyCounts(
  all: MentionsByHost,
  host: string,
  counts: MentionCounts,
): MentionsByHost {
  const kept: MentionCounts = {};
  for (const [conversation, n] of Object.entries(counts ?? {})) {
    // A zero is an absence. Keeping it would draw a badge saying "0".
    if (n > 0) kept[conversation] = n;
  }

  if (Object.keys(kept).length === 0) {
    if (!(host in all)) return all;
    const next = { ...all };
    delete next[host];
    return next;
  }

  return { ...all, [host]: kept };
}

/** One more, from a message that arrived while we were connected. */
export function addMention(
  all: MentionsByHost,
  host: string,
  conversationId: string,
): MentionsByHost {
  const counts = all[host] ?? {};
  return {
    ...all,
    [host]: { ...counts, [conversationId]: (counts[conversationId] ?? 0) + 1 },
  };
}

/** They have read this conversation. */
export function clearMentions(
  all: MentionsByHost,
  host: string,
  conversationId: string,
): MentionsByHost {
  const counts = all[host];
  if (!counts || !(conversationId in counts)) return all;

  const next = { ...counts };
  delete next[conversationId];

  if (Object.keys(next).length === 0) {
    const without = { ...all };
    delete without[host];
    return without;
  }
  return { ...all, [host]: next };
}

/** Everything waiting on one server, for the badge on its switcher tile. */
export function totalFor(all: MentionsByHost, host: string): number {
  let total = 0;
  for (const n of Object.values(all[host] ?? {})) total += n;
  return total;
}

/** Mention rows the badges count, without @everyone and @here while suppressed. */
export function countMentionRows(
  rows: readonly { conversation_id?: string; kind?: string }[],
  suppress: boolean,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row?.conversation_id) continue;
    if (suppress && (row.kind === "everyone" || row.kind === "here")) continue;
    counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1;
  }
  return counts;
}

/** Unseen mentions per thread, each with the channel it hangs off. */
export type ThreadMentionCounts = Record<string, { conversationId: string; count: number }>;

export type ThreadMentionsByHost = Record<string, ThreadMentionCounts>;

/** Built from the rows, because the server's `threadCounts` carries no channel. */
export function countThreadMentionRows(
  rows: readonly { conversation_id?: string; thread_id?: string | null; kind?: string }[],
  suppress: boolean,
): ThreadMentionCounts {
  const counts: ThreadMentionCounts = {};
  for (const row of rows) {
    if (!row?.thread_id || !row.conversation_id) continue;
    if (suppress && (row.kind === "everyone" || row.kind === "here")) continue;
    const held = counts[row.thread_id];
    counts[row.thread_id] = { conversationId: row.conversation_id, count: (held?.count ?? 0) + 1 };
  }
  return counts;
}

/** Replace one server's thread counts, the way `applyCounts` does its channel counts. */
export function applyThreadCounts(
  all: ThreadMentionsByHost,
  host: string,
  counts: ThreadMentionCounts,
): ThreadMentionsByHost {
  if (Object.keys(counts).length === 0) {
    if (!(host in all)) return all;
    const next = { ...all };
    delete next[host];
    return next;
  }
  return { ...all, [host]: counts };
}

export function addThreadMention(
  all: ThreadMentionsByHost,
  host: string,
  conversationId: string,
  threadId: string,
): ThreadMentionsByHost {
  const counts = all[host] ?? {};
  return {
    ...all,
    [host]: { ...counts, [threadId]: { conversationId, count: (counts[threadId]?.count ?? 0) + 1 } },
  };
}

export function clearThreadMentions(
  all: ThreadMentionsByHost,
  host: string,
  threadId: string,
): ThreadMentionsByHost {
  const counts = all[host];
  if (!counts || !(threadId in counts)) return all;
  const next = { ...counts };
  delete next[threadId];
  return applyThreadCounts(all, host, next);
}

/** Every thread mention hanging off one channel. The channel's own count includes these. */
export function threadMentionsIn(all: ThreadMentionsByHost, host: string, conversationId: string): number {
  let total = 0;
  for (const entry of Object.values(all[host] ?? {})) {
    if (entry.conversationId === conversationId) total += entry.count;
  }
  return total;
}

/**
 * Opening a channel reads its timeline and not its threads, so the thread part of its
 * count stays. Clearing all of it made the server's reply put it back, and ask again.
 */
export function clearTimelineMentions(
  all: MentionsByHost,
  host: string,
  conversationId: string,
  inThreads: number,
): MentionsByHost {
  if (inThreads <= 0) return clearMentions(all, host, conversationId);
  if ((all[host]?.[conversationId] ?? 0) === inThreads) return all;
  return { ...all, [host]: { ...all[host], [conversationId]: inThreads } };
}
