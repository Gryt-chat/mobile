/**
 * What the composer should be offering, given what has been typed. Pure and in
 * its own file, because every interesting case is a rule about a caret position
 * rather than a view — all testable and none of them visible.
 *
 * Two triggers behaving the same. The desktop has one component each, because
 * on a keyboard they differ; on a phone both are a row above the keyboard.
 */

export type Trigger = "@" | ":";

export interface Query {
  trigger: Trigger;
  /** What has been typed after the trigger, which may be empty. */
  term: string;
  /** Where the trigger character is, so a pick knows what to replace. */
  start: number;
  /** One past the last character of the term. */
  end: number;
}

/**
 * The query the caret is inside, or null.
 *
 * **Only ever looks backwards from the caret.** Somebody editing the middle of
 * a message should not be offered completions for a name further along that
 * they are not touching.
 */
export function queryAt(text: string, caret: number): Query | null {
  const before = text.slice(0, caret);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    const char = before[i];

    /* A space ends the search rather than being skipped over. A two-word
     * nickname is therefore not completable past its first word, which is a
     * real limit and the right trade: the alternative is scanning back over
     * every space in the message and offering a completion for a `@` three
     * sentences ago. Picking from the list still inserts the whole name. */
    if (char === " " || char === "\n") return null;

    if (char === "@" || char === ":") {
      /* A trigger has to start a word. `mail@ada` is an address, and `9:30` is
       * a time — neither is somebody starting to write a mention. */
      const preceding = i > 0 ? before[i - 1] : " ";
      if (!/[\s(]/.test(preceding)) return null;

      const term = before.slice(i + 1);
      /* A finished `:name:` is not a query any more — the closing colon means
       * they typed the whole thing, and offering to complete it would put the
       * list back over a message that is done. */
      if (char === ":" && term.includes(":")) return null;

      return { trigger: char, term, start: i, end: caret };
    }
  }

  return null;
}

/**
 * Narrowed to what matches, best first.
 *
 * Prefix matches before the rest, which is the order somebody typing expects:
 * `:ta` should offer `tada` before `star`. Within each group the original order
 * is kept, so a server's own emoji stay in whatever order it sent them.
 */
export function rank(candidates: string[], term: string, limit = 8): string[] {
  if (!term) return candidates.slice(0, limit);

  const needle = term.toLowerCase();
  const prefix: string[] = [];
  const rest: string[] = [];

  for (const candidate of candidates) {
    const value = candidate.toLowerCase();
    if (value.startsWith(needle)) prefix.push(candidate);
    else if (value.includes(needle)) rest.push(candidate);
  }

  return [...prefix, ...rest].slice(0, limit);
}

/**
 * The text after picking one, and where the caret goes. Everything gets a
 * trailing space, or the list stays open over its own result.
 *
 * `insert` is what goes into the field when that differs from what was picked:
 * **a standard emoji goes in as the character**. Left out, the shortcode goes
 * in as written, which is the answer for a custom one.
 */
export function complete(
  text: string,
  query: Query,
  choice: string,
  insert?: string,
): { text: string; caret: number } {
  const body = insert ?? (query.trigger === "@" ? `@${choice}` : `:${choice}:`);
  const inserted = `${body} `;
  return {
    text: text.slice(0, query.start) + inserted + text.slice(query.end),
    caret: query.start + inserted.length,
  };
}

/**
 * A `:shortcode:` the last keystroke finished — the other way an emoji gets
 * completed, typed out by hand without the list ever being tapped.
 *
 * **Driven off the edit rather than off the caret**, or it fires when somebody
 * merely moves the cursor after a `:tada:` they typed a minute ago.
 */
export function justClosedShortcode(
  previous: string,
  next: string,
): { name: string; start: number; end: number } | null {
  // Exactly one character longer, and that character is a colon.
  if (next.length !== previous.length + 1) return null;

  let at = 0;
  while (at < previous.length && previous[at] === next[at]) at += 1;
  if (next[at] !== ":") return null;
  if (previous.slice(at) !== next.slice(at + 1)) return null;

  const opened = /:([a-zA-Z0-9_+-]+)$/.exec(next.slice(0, at));
  if (!opened) return null;

  const start = at - opened[0].length;
  /* The opening colon has to start a word, the same rule `queryAt` uses — so
   * `9:30:` is a time somebody is still typing rather than an emoji called
   * "30". */
  const before = start > 0 ? next[start - 1] : " ";
  if (!/[\s(]/.test(before)) return null;

  return { name: opened[1], start, end: at + 1 };
}
