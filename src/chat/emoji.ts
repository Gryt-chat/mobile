import { nameToEmoji } from "gemoji";

/**
 * What a `:shortcode:` turns out to be. Standard names come from `gemoji`, **the same
 * table the desktop reads**; custom ones belong to one server and are pictures.
 */

export type Emoji =
  | { kind: "unicode"; character: string }
  /** A picture on the server this message came from. */
  | { kind: "custom"; url: string };

/**
 * The character for a standard name, or null. **`gemoji` is 350 KB evaluated at
 * startup**, traded against a generated subset that would drift from the desktop.
 */
export function unicodeFor(name: string): string | null {
  return nameToEmoji[name] ?? null;
}

/**
 * A name, resolved against the standard table and then this server's own. **Standard
 * first**, so a server cannot shadow `:+1:`. Null puts the literal text back.
 */
export function resolveEmoji(name: string, custom: ReadonlyMap<string, string>): Emoji | null {
  const character = unicodeFor(name);
  if (character) return { kind: "unicode", character };

  const url = custom.get(name);
  return url ? { kind: "custom", url } : null;
}

/**
 * Every standard shortcode name, for the autocomplete to search. Cached: rebuilding
 * several thousand entries per keystroke is the most expensive thing here.
 */
let names: string[] | null = null;
export function standardEmojiNames(): string[] {
  if (!names) names = Object.keys(nameToEmoji);
  return names;
}
