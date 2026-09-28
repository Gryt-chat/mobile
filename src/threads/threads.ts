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
