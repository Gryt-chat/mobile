/**
 * How many times somebody has been named in a conversation and not read it.
 * Apart from the unread count next door, which is per *server* and has no read
 * cursor behind it — a mention does, so this one can say which channel.
 *
 * **Every function returns a new object and leaves its input alone**, because
 * these run inside a React state updater.
 */

/** Unseen mentions per conversation, for one server. */
export type MentionCounts = Record<string, number>;

/** Every server's, by host. */
export type MentionsByHost = Record<string, MentionCounts>;

/**
 * Replace one server's counts with what it just told us.
 *
 * Replace rather than merge: the server has answered with everything that is
 * unseen, so a conversation it did not name has been read somewhere else — on
 * a desktop, or in another session. Merging would keep a badge nothing clears.
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
