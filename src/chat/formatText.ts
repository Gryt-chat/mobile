export type Format = "bold" | "italic" | "strike" | "code" | "link" | "h1" | "h2" | "h3" | "list" | "quote";

type Edit = { text: string; start: number; end: number };

const WRAP: Partial<Record<Format, string>> = { bold: "**", italic: "*", strike: "~~", code: "`" };
const PREFIX: Partial<Record<Format, string>> = { h1: "# ", h2: "## ", h3: "### ", list: "- ", quote: "> " };
const HEADING = /^#{1,3} /;
const LINK_TAIL = /^\]\([^)]*\)/;

// `*` is italic on an odd run and bold on two or more, so `***x***` is both.
function wrapped(text: string, start: number, end: number, mark: string): boolean {
  if (mark[0] !== "*") return text.slice(0, start).endsWith(mark) && text.slice(end).startsWith(mark);
  const before = text.slice(0, start).match(/\*+$/)?.[0].length ?? 0;
  const after = text.slice(end).match(/^\*+/)?.[0].length ?? 0;
  const run = Math.min(before, after);
  return mark === "*" ? run % 2 === 1 : run >= 2;
}

function lineBlock(text: string, start: number, end: number) {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const newline = text.indexOf("\n", end);
  const to = newline === -1 ? text.length : newline;
  return { from, to, lines: text.slice(from, to).split("\n") };
}

export function isActive(text: string, start: number, end: number, format: Format): boolean {
  const mark = WRAP[format];
  if (mark) return wrapped(text, start, end, mark);
  if (format === "link") return text[start - 1] === "[" && LINK_TAIL.test(text.slice(end));
  const prefix = PREFIX[format] ?? "";
  const { lines } = lineBlock(text, start, end);
  const filled = lines.filter((l) => l.trim());
  return filled.length > 0 && filled.every((l) => l.startsWith(prefix));
}

/** The text after pressing a format button, and what stays selected. */
export function applyFormat(text: string, start: number, end: number, format: Format): Edit {
  const on = isActive(text, start, end, format);
  const mark = WRAP[format];
  if (mark) {
    const n = mark.length;
    if (on) return { text: text.slice(0, start - n) + text.slice(start, end) + text.slice(end + n), start: start - n, end: end - n };
    return { text: text.slice(0, start) + mark + text.slice(start, end) + mark + text.slice(end), start: start + n, end: end + n };
  }
  if (format === "link") {
    if (on) {
      const tail = text.slice(end).match(LINK_TAIL)?.[0].length ?? 0;
      return { text: text.slice(0, start - 1) + text.slice(start, end) + text.slice(end + tail), start: start - 1, end: end - 1 };
    }
    // The caret lands between the brackets, ready for the address.
    const at = end + 3;
    return { text: `${text.slice(0, start)}[${text.slice(start, end)}]()${text.slice(end)}`, start: at, end: at };
  }
  const prefix = PREFIX[format] ?? "";
  const { from, to, lines } = lineBlock(text, start, end);
  const next = lines.map((line) => {
    if (!line.trim()) return line;
    if (on) return line.slice(prefix.length);
    const bare = format.startsWith("h") ? line.replace(HEADING, "") : line;
    return prefix + bare;
  });
  const block = next.join("\n");
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
}
