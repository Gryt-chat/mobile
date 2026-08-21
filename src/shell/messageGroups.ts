import type { LocalMessage } from "../connection/outbox";

/* Deciding what a message looks like from the ones around it.
 *
 * Pure and in its own file so it can be tested — the two worst layout bugs in
 * this app were both arithmetic, and this is arithmetic about time.
 */

/** Consecutive messages from one person inside this window share a header. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface Row {
  message: LocalMessage;
  /** A date heading goes above this one. */
  dayLabel: string | null;
  /** Show the avatar and name, rather than continuing the block above. */
  showHeader: boolean;
}

/** Local midnight, so "same day" means the reader's day rather than UTC's. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabelFor(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (dayKey(iso) === dayKey(now.toISOString())) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";

  // Inside the last week, the weekday is easier to place than a date.
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Messages, oldest first, with the two things that depend on their neighbours.
 *
 * A header is shown when the sender changes, when the gap gets long enough that
 * a run stops reading as one, or when a new day starts — a block that continues
 * across a date heading looks like it belongs to the heading.
 */
export function groupMessages(messages: LocalMessage[], now = new Date()): Row[] {
  const rows: Row[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const previous = i > 0 ? messages[i - 1] : null;

    const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);

    const gap = previous
      ? new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()
      : Infinity;

    const showHeader =
      newDay ||
      !previous ||
      previous.sender_server_id !== message.sender_server_id ||
      gap > GROUP_WINDOW_MS;

    rows.push({
      message,
      dayLabel: newDay ? dayLabelFor(message.created_at, now) : null,
      showHeader,
    });
  }

  return rows;
}
