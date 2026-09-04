/**
 * A channel name short enough to put inside a sentence.
 *
 * The composer's placeholder is "Message #<name>" and the input is `multiline`,
 * so a long name wraps and the composer grows a second line before anybody has
 * typed anything. `numberOfLines={1}` cannot help: a placeholder is a prop on
 * the input, not a child of it.
 *
 * Cut on a character count rather than measured width — the composer's width is
 * not knowable from here, and it only has to stop the wrap.
 *
 * The ellipsis is the single character, so it costs one place of the budget
 * rather than three.
 */
const LIMIT = 28;

export function shortChannelName(name: string, limit: number = LIMIT): string {
  if (name.length <= limit) return name;
  /* Trailing spaces and separators before the ellipsis read as a typo — "dev —…"
   * rather than "dev…". Both in one pass: trimming first and stripping after
   * leaves the space that was in front of the separator ("Lounge — " became
   * "Lounge " rather than "Lounge"). */
  return `${name.slice(0, limit).replace(/[\s\-–—_.]+$/u, "")}…`;
}
