import { nameToEmoji } from "gemoji";

/**
 * What a `:shortcode:` turns out to be. Standard names come from `gemoji`,
 * **the same table the desktop reads**, which is the reason for taking the
 * dependency rather than shipping a hand-picked list. Custom ones belong to one
 * server and are pictures.
 *
 * Neither is the parser's business: `markdown.ts` carries the name and nothing
 * else, and this is where a name becomes an answer.
 */

export type Emoji =
  | { kind: "unicode"; character: string }
  /** A picture on the server this message came from. */
  | { kind: "custom"; url: string };

/**
 * The character for a standard name, or null. **`gemoji` is 350 KB evaluated at
 * startup** whether or not a message has a shortcode — the trade is against a
 * generated subset that would drift from the desktop's table silently, with
 * `:shrug:` rendering on one client and not the other.
 */
export function unicodeFor(name: string): string | null {
  return nameToEmoji[name] ?? null;
}

/**
 * A name, resolved against the standard table and then this server's own.
 * **Standard first**, so a server cannot shadow `:+1:` and make a message mean
 * two things depending on where it is read. Null for a colon that was never a
 * shortcode, and the renderer puts the literal text back.
 */
export function resolveEmoji(name: string, custom: ReadonlyMap<string, string>): Emoji | null {
  const character = unicodeFor(name);
  if (character) return { kind: "unicode", character };

  const url = custom.get(name);
  return url ? { kind: "custom", url } : null;
}

/**
 * Every standard shortcode name, for the autocomplete to search. Cached,
 * because rebuilding several thousand entries on every keystroke after a colon
 * is the most expensive thing the composer would do.
 */
let names: string[] | null = null;
export function standardEmojiNames(): string[] {
  if (!names) names = Object.keys(nameToEmoji);
  return names;
}
