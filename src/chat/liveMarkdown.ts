import type { MarkdownRange } from "@expensify/react-native-live-markdown/src/commonTypes";

const HIDE = "\u0000";

/** What the composer styles as you type. A worklet: it runs on the field's own thread. */
export function parseLiveMarkdown(input: string): MarkdownRange[] {
  "worklet";
  const ranges: MarkdownRange[] = [];
  const add = (type: MarkdownRange["type"], start: number, length: number) => {
    if (length > 0) ranges.push({ type, start, length });
  };
  // Markers already used are blanked out so a later pattern cannot claim them twice.
  const hide = (s: string, from: number, to: number) => s.slice(0, from) + HIDE.repeat(to - from) + s.slice(to);

  const inline = (line: string, base: number) => {
    let scan = line;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const at = m.index ?? 0;
      add("syntax", base + at, 1);
      add("code", base + at + 1, m[1].length);
      add("syntax", base + at + m[0].length - 1, 1);
      scan = hide(scan, at, at + m[0].length);
    }
    const pairs: [RegExp, number, MarkdownRange["type"][]][] = [
      [/\*\*\*(?=[^\s*])([^\0]*?[^\s*])\*\*\*/g, 3, ["bold", "italic"]],
      [/\*\*(?=[^\s*])([^\0]*?[^\s*])\*\*/g, 2, ["bold"]],
      [/~~(?=\S)([^\0]*?\S)~~/g, 2, ["strikethrough"]],
      [/(?:^|(?<=[^*]))\*(?=[^\s*])([^\0*]*?[^\s*])\*(?!\*)/g, 1, ["italic"]],
      [/(?:^|(?<=\W))_(?=\S)([^\0]*?\S)_(?!\w)/g, 1, ["italic"]],
    ];
    for (const [pattern, n, types] of pairs) {
      for (const m of scan.matchAll(pattern)) {
        const at = m.index ?? 0;
        add("syntax", base + at, n);
        for (const type of types) add(type, base + at + n, m[1].length);
        add("syntax", base + at + n + m[1].length, n);
        scan = hide(hide(scan, at, at + n), at + n + m[1].length, at + m[0].length);
      }
    }
    for (const m of scan.matchAll(/\[([^\]\0]+)\]\(([^)\s\0]+)\)/g)) {
      const at = m.index ?? 0;
      add("syntax", base + at, 1);
      add("link", base + at + 1, m[1].length);
      add("syntax", base + at + 1 + m[1].length, m[2].length + 3);
      scan = hide(scan, at, at + m[0].length);
    }
    for (const m of scan.matchAll(/https?:\/\/[^\s\0]+[^\s\0.,!?;:)]/g)) add("link", base + (m.index ?? 0), m[0].length);
    for (const m of scan.matchAll(/(?:^|(?<=\s))@(everyone|here)\b/g)) add("mention-here", base + (m.index ?? 0), m[0].length);
  };

  let offset = 0;
  let fenced = false;
  for (const line of input.split("\n")) {
    if (line.startsWith("```")) {
      add("syntax", offset, line.length);
      fenced = !fenced;
    } else if (fenced) {
      add("pre", offset, line.length);
    } else {
      const quote = /^> ?/.exec(line);
      const heading = /^#{1,3} /.exec(line);
      if (quote) {
        ranges.push({ type: "blockquote", start: offset, length: line.length, depth: 1 });
        add("syntax", offset, 1);
        inline(line.slice(quote[0].length), offset + quote[0].length);
      } else if (heading) {
        add("syntax", offset, heading[0].length);
        add("h1", offset + heading[0].length, line.length - heading[0].length);
        inline(line.slice(heading[0].length), offset + heading[0].length);
      } else {
        inline(line, offset);
      }
    }
    offset += line.length + 1;
  }
  return ranges.sort((a, b) => a.start - b.start);
}
