import { nameToEmoji } from "gemoji";

/**
 * What a `:shortcode:` turns out to be.
 *
 * Two sources, and they are not the same kind of thing. The standard names come
 * from `gemoji`, which is a table of name to character and is the same table
 * the desktop reads — so `:shrug:` means the same thing in both clients, which
 * is the whole reason for taking the dependency rather than shipping a
 * hand-picked list. The custom ones belong to one server and are pictures.
 *
 * Neither is the parser's business. `markdown.ts` produces a `shortcode` node
 * carrying the name and nothing else, and this is where a name becomes an
 * answer.
 */

export type Emoji =
  | { kind: "unicode"; character: string }
  /** A picture on the server this message came from. */
  | { kind: "custom"; url: string };

/**
 * The character for a standard name, or null.
 *
 * `gemoji` is about 350 KB of data and this is the only thing read out of it,
 * which is worth stating because it is a real cost on a phone: the module is
 * evaluated at startup whether or not a message contains a shortcode. The trade
 * is against a generated subset that would drift from the desktop's table
 * silently, and drifting silently is the worse failure — `:shrug:` rendering on
 * one client and not the other, with nothing to point at.
 */
export function unicodeFor(name: string): string | null {
  return nameToEmoji[name] ?? null;
}

/**
 * A name, resolved against the standard table and then this server's own.
 *
 * Standard first, matching the desktop: a server cannot shadow `:+1:` by
 * uploading something called that, which stops a message meaning two different
 * things depending on where it is read.
 *
 * Null is the ordinary answer for a colon that was never a shortcode — `9:30`,
 * or the middle of `a:b:c` — and the renderer puts the literal text back.
 */
export function resolveEmoji(name: string, custom: ReadonlyMap<string, string>): Emoji | null {
  const character = unicodeFor(name);
  if (character) return { kind: "unicode", character };

  const url = custom.get(name);
  return url ? { kind: "custom", url } : null;
}

/**
 * Every standard shortcode name, for the autocomplete to search.
 *
 * Cached, because there are several thousand of them and the alternative is
 * rebuilding the array on every keystroke after a colon — which is the most
 * expensive thing the composer would do. The table itself is already loaded by
 * then: `unicodeFor` imports it at the top of this file, so there is nothing to
 * defer, only something not to repeat.
 */
let names: string[] | null = null;
export function standardEmojiNames(): string[] {
  if (!names) names = Object.keys(nameToEmoji);
  return names;
}
