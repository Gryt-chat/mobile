import type { ThreadSummary } from "../connection/types";

/* Threads and forum topics, as pure functions so the rules can be tested without a
 * socket. The desktop's useThreads and ForumView are the reference for each one. */

/** Summaries keyed by root message id, so a row can find its own thread. */
export type Summaries = Record<string, ThreadSummary>;

/** What `thread:updated` carries: only what changed, plus the three ids. */
export type ThreadUpdate = Partial<ThreadSummary> &
  Pick<ThreadSummary, "conversation_id" | "thread_id" | "root_message_id">;

/** Every page of channel history brings the threads hanging off it. Merged, never replaced. */
export function mergeSummaries(prev: Summaries, incoming: ThreadSummary[] | undefined): Summaries {
  if (!Array.isArray(incoming) || incoming.length === 0) return prev;
  const next = { ...prev };
  for (const t of incoming) {
    if (!t?.root_message_id) continue;
    next[t.root_message_id] = { ...next[t.root_message_id], ...t };
  }
  return next;
}

/** Merged rather than overwritten: replacing dropped the title on every reply. */
export function applyUpdate(prev: Summaries, update: ThreadUpdate): Summaries {
  return {
    ...prev,
    [update.root_message_id]: { ...prev[update.root_message_id], ...update } as ThreadSummary,
  };
}

export function removeSummary(prev: Summaries, rootMessageId: string): Summaries {
  if (!(rootMessageId in prev)) return prev;
  const next = { ...prev };
  delete next[rootMessageId];
  return next;
}

/** What chat:send checks before it takes a reply. A composer it would refuse is worse than none. */
export function takesReplies(thread: Pick<ThreadSummary, "status" | "locked">): boolean {
  return thread.status !== "closed" && thread.locked !== true;
}

export function repliesLabel(count: number): string {
  return `${count} ${count === 1 ? "reply" : "replies"}`;
}

/** The author or a moderator may set the status; the server refuses everyone else. */
export function maySetStatus(
  thread: Pick<ThreadSummary, "created_by">,
  me: string | null,
  mayManageMessages: boolean,
): boolean {
  return (!!me && thread.created_by === me) || mayManageMessages;
}

/**
 * Why a thread screen has nothing to show. `deleted` is the thread going while it was
 * open, `missing` the server saying it no longer exists when asked.
 */
export type ThreadGone = "deleted" | "missing" | null;

/** thread:error names a missing thread by code. Anything else is a refusal to draw. */
export function goneFromError(payload: unknown): ThreadGone {
  return payload && typeof payload === "object" && (payload as { error?: unknown }).error === "thread_not_found"
    ? "missing"
    : null;
}

export function errorText(payload: unknown): string {
  if (typeof payload === "string") return payload || "Something went wrong.";
  const p = payload as { message?: string; error?: string } | null;
  return p?.message || p?.error || "Something went wrong.";
}

/** A forum topic row: a summary plus what only the topic list needs. */
export interface ForumTopic extends ThreadSummary {
  participant_count: number;
  creator_server_id?: string;
  creator_nickname: string | null;
  creator_avatar_file_id?: string | null;
  preview: string | null;
  tags: string[];
}

export type ForumFilter = "all" | "unanswered" | "solved" | "closed" | "mine";

/** The desktop's order. All leaves closed topics out, so Closed is the way back to them. */
export const FORUM_FILTERS: { key: ForumFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unanswered", label: "Unanswered" },
  { key: "solved", label: "Solved" },
  { key: "closed", label: "Closed" },
  { key: "mine", label: "Mine" },
];

export function matchesFilter(t: ForumTopic, filter: ForumFilter, me: string | null): boolean {
  switch (filter) {
    // A solved topic is answered even with no replies: the author settled it.
    case "unanswered": return t.reply_count === 0 && t.status === "open";
    case "solved": return t.status === "solved";
    case "closed": return t.status === "closed";
    case "mine": return !!me && t.created_by === me;
    default: return t.status !== "closed";
  }
}

export function filterCounts(topics: ForumTopic[], me: string | null): Record<ForumFilter, number> {
  const counts = { all: 0, unanswered: 0, solved: 0, closed: 0, mine: 0 };
  for (const t of topics) {
    for (const f of FORUM_FILTERS) if (matchesFilter(t, f.key, me)) counts[f.key]++;
  }
  return counts;
}

/** A topic matches the tags when it carries any one of them. No tags picked is every topic. */
export function shownTopics(
  topics: ForumTopic[],
  filter: ForumFilter,
  me: string | null,
  tags: ReadonlySet<string>,
): ForumTopic[] {
  return topics.filter(
    (t) => matchesFilter(t, filter, me) && (tags.size === 0 || t.tags.some((id) => tags.has(id))),
  );
}

/** The server names the author `creator_server_id` on a topic row. */
export function topicFromWire(t: Omit<ForumTopic, "tags"> & { tags?: string[] }): ForumTopic {
  return { ...t, created_by: t.created_by ?? t.creator_server_id ?? "", tags: t.tags ?? [] };
}

/** "just now", "5m", "3h", "yesterday", "4d", then a date. The desktop's wording. */
export function relativeTime(value: string, now = Date.now()): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** The server's own cap on a message, so an over-long first post is caught before a round trip. */
export const TOPIC_BODY_MAX = 4000;
