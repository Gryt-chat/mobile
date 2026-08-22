/**
 * A channel name short enough to put inside a sentence.
 *
 * The composer's placeholder is "Message #<name>", and the input is
 * `multiline` — so a long name wraps and the whole composer grows a second line
 * before anybody has typed anything. Every other place a name appears is a
 * `Text` with `numberOfLines={1}`, which cannot help here: a placeholder is a
 * prop on the input, not a child of it.
 *
 * Cut on a whole character count rather than measured width, because the
 * composer's width is not knowable from here and a rough cap is enough for the
 * job — it only has to stop the wrap, not fill the line exactly.
 *
 * The ellipsis is the single character, not three dots, so it costs one place
 * of the budget rather than three.
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
