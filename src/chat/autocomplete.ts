/**
 * What the composer should be offering, given what has been typed. Pure, because
 * every interesting case is a rule about a caret position rather than a view.
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
 * The query the caret is inside, or null. **Only ever looks backwards from the
 * caret**, so editing mid-message does not offer completions further along.
 */
export function queryAt(text: string, caret: number): Query | null {
  const before = text.slice(0, caret);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    const char = before[i];

    /* A space ends the search rather than being skipped over, so a two-word nickname
     * is not completable past its first word. The alternative is offering a
     * completion for a `@` three sentences ago. Picking still inserts the whole. */
    if (char === " " || char === "\n") return null;

    if (char === "@" || char === ":") {
      /* A trigger has to start a word. `mail@ada` is an address, and `9:30` is
       * a time — neither is somebody starting to write a mention. */
      const preceding = i > 0 ? before[i - 1] : " ";
      if (!/[\s(]/.test(preceding)) return null;

      const term = before.slice(i + 1);
      /* A finished `:name:` is not a query any more — the closing colon means they
       * typed the whole thing. */
      if (char === ":" && term.includes(":")) return null;

      return { trigger: char, term, start: i, end: caret };
    }
  }

  return null;
}

/**
 * Narrowed to what matches, best first: prefix matches before the rest, so `:ta`
 * offers `tada` before `star`. Within each group the original order is kept.
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
 * The text after picking one, and where the caret goes. Everything gets a trailing
 * space. `insert` is used when it differs — **a standard emoji goes in as the
 * character**, and a custom one as its shortcode.
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
 * A `:shortcode:` the last keystroke finished. **Driven off the edit rather than off
 * the caret**, or it fires when somebody merely moves the cursor.
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
  /* The opening colon has to start a word, the same rule `queryAt` uses, so `9:30:`
   * is a time somebody is still typing. */
  const before = start > 0 ? next[start - 1] : " ";
  if (!/[\s(]/.test(before)) return null;

  return { name: opened[1], start, end: at + 1 };
}
