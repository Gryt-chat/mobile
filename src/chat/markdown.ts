/**
 * Message text, parsed into something a `Text` tree can draw. **Parsed here**, because
 * emoji and mentions are node types. **Deliberately not CommonMark.**
 */

/** A run of text, or a mark wrapping more of them. */
export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  /**
   * `:shrug:`, unresolved. **The parser does not know which shortcodes exist** — the
   * custom ones belong to a server — so this carries the name.
   */
  | { type: "shortcode"; name: string }
  /**
   * `@Sivert`, matched against the people in this server. **Not produced by
   * `parseInline`**: a nickname can be two words. See `applyMentions`.
   */
  | { type: "mention"; name: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "strike"; children: Inline[] };

/**
 * One block of a message. A list item holds inlines; a quote holds blocks, because
 * a quoted code block is a thing people paste.
 */
export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "code"; lang: string | null; value: string }
  | { type: "quote"; children: Block[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] };

const FENCE = /^\s{0,3}(```|~~~)\s*([^`\s]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,3})\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;

/**
 * Text to blocks. Empty in, empty out — a message with only an attachment draws
 * nothing rather than an empty paragraph with a line height.
 */
export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2] || null;
      const body: string[] = [];
      i += 1;
      /* An unclosed fence runs to the end of the message: somebody who opens one
       * and hits send meant the rest to be code, line breaks included. */
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", lang, value: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        // Trailing hashes are a closing marker, not part of the words.
        children: parseInline(heading[2].replace(/\s+#+\s*$/, "")),
      });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ type: "quote", children: parseMarkdown(quoted.join("\n")) });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      const start = ordered ? Number(ORDERED.exec(line)![1]) : 1;
      const items: Inline[][] = [];
      /* One kind of list at a time. A bullet directly under a number starts a
       * second list, which is what the markers say. */
      while (i < lines.length) {
        const match = ordered ? ORDERED.exec(lines[i]) : BULLET.exec(lines[i]);
        if (!match) break;
        items.push(parseInline(ordered ? match[2] : match[1]));
        i += 1;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    /* A paragraph runs to the next blank line or block, and the lines are kept: the
     * desktop runs `remark-breaks`, so reflowing here would disagree with it. */
    const paragraph: string[] = [];
    while (i < lines.length) {
      const next = lines[i];
      if (next.trim() === "") break;
      if (FENCE.test(next) || HEADING.test(next) || QUOTE.test(next)) break;
      if (BULLET.test(next) || ORDERED.test(next)) break;
      paragraph.push(next);
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }

  return blocks;
}

/* Autolinks, deliberately narrow. Trailing punctuation is trimmed below, because a
 * full stop is legal inside a URL and almost never meant at the end of one. */
const AUTOLINK = /^(https?:\/\/|www\.)[^\s<>()[\]]+/i;

/** How a run of text ends up as one of everything else. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (text) out.push({ type: "text", value: text });
    text = "";
  };

  while (i < src.length) {
    const rest = src.slice(i);
    const char = src[i];

    /* A backslash makes the next character literal, which is the only way to
     * write an asterisk in a sentence about markdown. */
    if (char === "\\" && i + 1 < src.length && /[\\`*_~[\]()#>-]/.test(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    /* Code first, and it wins over everything. A run of backticks closes on a run
     * of the same length, and nothing inside is parsed. */
    if (char === "`") {
      const open = /^`+/.exec(rest)![0];
      const closeAt = rest.indexOf(open, open.length);
      if (closeAt !== -1) {
        flush();
        const value = rest.slice(open.length, closeAt);
        /* One space either side is a wrapper, so `` ` `` can be written. More
         * than one is somebody's indentation and is kept. */
        out.push({
          type: "code",
          value: /^ .* $/.test(value) && value.trim() !== "" ? value.slice(1, -1) : value,
        });
        i += closeAt + open.length;
        continue;
      }
    }

    if (char === "[") {
      const link = matchLink(rest);
      if (link) {
        flush();
        out.push({ type: "link", href: link.href, children: parseInline(link.label) });
        i += link.length;
        continue;
      }
    }

    if (rest.startsWith("~~")) {
      const closed = closeAt(rest, "~~");
      if (closed !== -1) {
        flush();
        out.push({ type: "strike", children: parseInline(rest.slice(2, closed)) });
        i += closed + 2;
        continue;
      }
    }

    if ((char === "*" || char === "_") && canOpen(src, i)) {
      const run = char === "*" ? /^\*{1,3}/.exec(rest)![0] : /^_{1,3}/.exec(rest)![0];
      const closed = closeAt(rest, run, src, i);
      if (closed !== -1) {
        flush();
        const { content, consumed } = widen(rest, run, closed);
        const inner = parseInline(content);
        /* Three is both, and it nests rather than needing a third node type. */
        out.push(
          run.length === 1
            ? { type: "em", children: inner }
            : run.length === 2
              ? { type: "strong", children: inner }
              : { type: "strong", children: [{ type: "em", children: inner }] },
        );
        i += consumed;
        continue;
      }
    }

    /* `:shrug:` — matched, not resolved, with the same expression the desktop uses.
     * A URL is consumed whole, so the colon in `https://` is never stopped at. */
    if (char === ":") {
      const shortcode = /^:([a-zA-Z0-9_+-]+):/.exec(rest);
      if (shortcode) {
        flush();
        out.push({ type: "shortcode", name: shortcode[1] });
        i += shortcode[0].length;
        continue;
      }
    }

    const auto = AUTOLINK.exec(rest);
    if (auto && (i === 0 || /[\s(]/.test(src[i - 1]))) {
      /* A URL at the end of a sentence takes the full stop with it otherwise,
       * and a URL in brackets takes the bracket. */
      const url = auto[0].replace(/[.,;:!?'"]+$/, "");
      flush();
      out.push({
        type: "link",
        href: url.startsWith("www.") ? `https://${url}` : url,
        children: [{ type: "text", value: url }],
      });
      i += url.length;
      continue;
    }

    text += char;
    i += 1;
  }

  flush();
  return out;
}

/** `[label](href)`, with balanced brackets in the label and parens in the href. */
function matchLink(src: string): { label: string; href: string; length: number } | null {
  let depth = 0;
  let close = -1;
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === "\\") {
      i += 1;
      continue;
    }
    if (src[i] === "[") depth += 1;
    else if (src[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1 || src[close + 1] !== "(") return null;

  let parens = 0;
  for (let i = close + 1; i < src.length; i += 1) {
    if (src[i] === "(") parens += 1;
    else if (src[i] === ")") {
      parens -= 1;
      if (parens === 0) {
        const href = src.slice(close + 2, i).trim();
        // A link to nowhere is text with brackets round it, not a link.
        if (!href) return null;
        return { label: src.slice(1, close), href, length: i + 1 };
      }
    }
  }
  return null;
}

/**
 * How much of a longer closing run belongs to the emphasis inside this one. **Widened
 * only when it buys something** — parse both ways and compare.
 */
function widen(rest: string, run: string, closed: number): { content: string; consumed: number } {
  const narrow = { content: rest.slice(run.length, closed), consumed: closed + run.length };
  const closer = /^[*_]+/.exec(rest.slice(closed))![0];
  if (closer[0] !== run[0]) return narrow;

  const spare = Math.min(closer.length, 3) - run.length;
  if (spare <= 0 || hasEmphasis(parseInline(narrow.content))) return narrow;

  for (let extra = spare; extra > 0; extra -= 1) {
    const content = rest.slice(run.length, closed + extra);
    if (hasEmphasis(parseInline(content))) {
      return { content, consumed: closed + run.length + extra };
    }
  }
  return narrow;
}

function hasEmphasis(nodes: Inline[]): boolean {
  return nodes.some(
    (node) =>
      node.type === "em" ||
      node.type === "strong" ||
      (node.type === "strike" || node.type === "link" ? hasEmphasis(node.children) : false),
  );
}

/**
 * Where a run of delimiters closes, or -1. `full` and `at` are only passed for
 * emphasis, or `snake_case_name` is a word with an italic in the middle of it.
 */
function closeAt(rest: string, run: string, full?: string, at?: number): number {
  let i = run.length;
  while (i < rest.length) {
    if (rest[i] === "\\") {
      i += 2;
      continue;
    }
    if (rest.startsWith(run, i)) {
      // Nothing between the two is not emphasis, it is the characters typed.
      if (i === run.length) return -1;
      // A closer never follows a space: `a * b * c` is arithmetic.
      if (/\s/.test(rest[i - 1])) {
        i += 1;
        continue;
      }
      if (full !== undefined && at !== undefined && run[0] === "_") {
        const after = rest[i + run.length];
        if (after !== undefined && /\w/.test(after)) {
          i += 1;
          continue;
        }
      }
      return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Whether a delimiter here opens emphasis. `_` only at a word boundary; `*`
 * anywhere. Neither opens on a space — `2 * 3 * 4` is arithmetic.
 */
function canOpen(src: string, at: number): boolean {
  const run = /^([*_])\1{0,2}/.exec(src.slice(at))![0];
  const after = src[at + run.length];
  if (after === undefined || /\s/.test(after)) return false;
  if (src[at] === "_") {
    const before = src[at - 1];
    if (before !== undefined && /\w/.test(before)) return false;
  }
  return true;
}


/**
 * `@Sivert` in a text node becomes a mention — a pass over the finished tree, so a
 * nickname can be two words and `` `@Sivert` `` stays code. Longest first.
 */
export function applyMentions(nodes: Inline[], nicknames: string[]): Inline[] {
  if (nicknames.length === 0) return nodes;
  const sorted = [...nicknames].filter(Boolean).sort((a, b) => b.length - a.length);

  const visit = (list: Inline[]): Inline[] =>
    list.flatMap((node) => {
      switch (node.type) {
        case "text":
          return splitMentions(node.value, sorted);
        case "strong":
        case "em":
        case "strike":
          return [{ ...node, children: visit(node.children) }];
        case "link":
          return [{ ...node, children: visit(node.children) }];
        default:
          return [node];
      }
    });

  return visit(nodes);
}

function splitMentions(value: string, sorted: string[]): Inline[] {
  const out: Inline[] = [];
  let rest = value;

  while (rest.length > 0) {
    let at = -1;
    let matched: string | null = null;

    for (const nickname of sorted) {
      const index = rest.toLowerCase().indexOf(`@${nickname.toLowerCase()}`);
      if (index === -1) continue;
      /* Not part of a longer word on either side. Without the first check
       * an email address becomes a mention of whoever the domain is called. */
      if (index > 0 && /\w/.test(rest[index - 1])) continue;
      const after = index + 1 + nickname.length;
      if (after < rest.length && /\w/.test(rest[after])) continue;
      if (at === -1 || index < at) {
        at = index;
        matched = nickname;
      }
      /* The list is longest-first, so the first hit at the earliest position
       * is already the longest one there. */
      if (at === 0) break;
    }

    if (at === -1 || matched === null) {
      out.push({ type: "text", value: rest });
      break;
    }

    if (at > 0) out.push({ type: "text", value: rest.slice(0, at) });
    // The case that was typed, not the case on the member list.
    out.push({ type: "mention", name: rest.slice(at + 1, at + 1 + matched.length) });
    rest = rest.slice(at + 1 + matched.length);
  }

  return out;
}

/** Everything that is true of one run of characters. */
export interface Marks {
  strong: boolean;
  em: boolean;
  strike: boolean;
  code: boolean;
  href: string | null;
}

const PLAIN: Marks = { strong: false, em: false, strike: false, code: false, href: null };

/** One run of characters, and its marks. */
export interface Run {
  /** What to draw when there is nothing better — and for a plain run, always. */
  value: string;
  marks: Marks;
  /** A `:name:` the renderer should try to resolve to an emoji. */
  shortcode?: string;
  /** A nickname `applyMentions` recognised. */
  mention?: string;
}

/**
 * The inline tree, flattened. Nesting is how markdown is written and not how it has to
 * be drawn: a `Text` needs the finished answer for one run of characters.
 */
export function flattenInline(nodes: Inline[], marks: Marks = PLAIN): Run[] {
  const out: Run[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out.push({ value: node.value, marks });
        break;
      case "code":
        out.push({ value: node.value, marks: { ...marks, code: true } });
        break;
      case "shortcode":
        /* The literal text is what draws when nothing answers to the name, so
         * it is carried rather than reconstructed at the other end. */
        out.push({ value: `:${node.name}:`, marks, shortcode: node.name });
        break;
      case "mention":
        out.push({ value: `@${node.name}`, marks, mention: node.name });
        break;
      case "strong":
        out.push(...flattenInline(node.children, { ...marks, strong: true }));
        break;
      case "em":
        out.push(...flattenInline(node.children, { ...marks, em: true }));
        break;
      case "strike":
        out.push(...flattenInline(node.children, { ...marks, strike: true }));
        break;
      case "link":
        out.push(...flattenInline(node.children, { ...marks, href: node.href }));
        break;
    }
  }
  return out;
}

/**
 * The text of a tree, for the places that need words rather than marks — a screen
 * reader announcing the asterisks around a word is worse than announcing the word.
 */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.value;
        /* Read out as what was typed. A screen reader announcing "colon shrug
         * colon" is the same problem as one announcing the asterisks. */
        case "shortcode":
          return `:${node.name}:`;
        case "mention":
          return `@${node.name}`;
        default:
          return inlineText(node.children);
      }
    })
    .join("");
}

/** The words of a whole message, for the same reason. */
export function blocksText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "code":
          return block.value;
        case "quote":
          return blocksText(block.children);
        case "list":
          return block.items.map(inlineText).join("\n");
        default:
          return inlineText(block.children);
      }
    })
    .join("\n");
}
