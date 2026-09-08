/**
 * A channel name short enough to put inside a sentence: the composer is `multiline`, so
 * a long name wraps the placeholder and the composer opens two lines tall.
 * `numberOfLines` cannot help — a placeholder is a prop, not a child.
 */
const LIMIT = 28;

export function shortChannelName(name: string, limit: number = LIMIT): string {
  if (name.length <= limit) return name;
  /* Trailing spaces and separators before the ellipsis read as a typo. Both in one pass:
   * trimming first and stripping after leaves the space in front of the separator. */
  return `${name.slice(0, limit).replace(/[\s\-–—_.]+$/u, "")}…`;
}
