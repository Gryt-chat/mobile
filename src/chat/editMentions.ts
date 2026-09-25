import { findMentionLinks, PRIVATE_CHANNEL, type ChannelName, type MentionTarget } from "./mentionTokens";

/** A message loaded into the composer: the words shown, and for each word the
    link it stood for, in order of appearance. Null is a word typed as plain text. */
export interface EditDraft {
  text: string;
  links: Map<string, (string | null)[]>;
}

const LITERAL = /(```|~~~)[\s\S]*?(?:\1|$)|`[^`\n]*`/g;

function shownFor(target: MentionTarget, label: string, channelName: ChannelName): string {
  if (target.kind === "everyone" || target.kind === "here") return `@${target.kind}`;
  if (target.kind === "channel") {
    const name = channelName(target.id, target.host);
    return name ? `#${name}` : PRIVATE_CHANNEL;
  }
  const name = label.trim().replace(/^@/, "");
  return name ? `@${name}` : label;
}

/** Each place a shown word stands in the text, outside code, with the server's
    word boundaries (`replacePlain` in mentionSyntax.ts). Longest first at a tie. */
function occurrences(text: string, words: string[]): { index: number; word: string }[] {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const literal: [number, number][] = [];
  for (const m of text.matchAll(LITERAL)) literal.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  const inLiteral = (i: number) => literal.some(([start, end]) => i >= start && i < end);

  const found: { index: number; word: string }[] = [];
  let from = 0;
  let glued = -1;
  while (from < text.length) {
    let best: { index: number; word: string } | null = null;
    for (const word of sorted) {
      let index = text.indexOf(word, from);
      while (index !== -1) {
        // Straight after the last word counts, so `@Ada@Bob` finds both.
        const before = index > 0 && index !== glued ? text[index - 1] : "";
        const after = text[index + word.length] ?? "";
        if (!inLiteral(index) && !/[\w@#&/]/.test(before) && !/\w/.test(after)) break;
        index = text.indexOf(word, index + 1);
      }
      if (index !== -1 && (best === null || index < best.index)) best = { index, word };
    }
    if (!best) break;
    found.push(best);
    from = glued = best.index + best.word.length;
  }
  return found;
}

/** The stored text as the composer shows it: `[@Ada](mention:user_1)` becomes `@Ada`. */
export function editDraft(stored: string, channelName: ChannelName): EditDraft {
  let text = "";
  let cursor = 0;
  const spans = new Map<number, { word: string; link: string }>();
  for (const match of findMentionLinks(stored)) {
    text += stored.slice(cursor, match.index);
    const word = shownFor(match.target, match.label, channelName);
    if (!word) {
      text += stored.slice(match.index, match.index + match.length);
      cursor = match.index + match.length;
      continue;
    }
    spans.set(text.length, { word, link: stored.slice(match.index, match.index + match.length) });
    text += word;
    cursor = match.index + match.length;
  }
  text += stored.slice(cursor);

  const links = new Map<string, (string | null)[]>();
  const words = [...new Set([...spans.values()].map((s) => s.word))];
  for (const { index, word } of occurrences(text, words)) {
    const span = spans.get(index);
    const list = links.get(word) ?? [];
    list.push(span && span.word === word ? span.link : null);
    links.set(word, list);
  }
  return { text, links };
}

/** The edited text with each mention put back as the link it was loaded from, so
    an unchanged edit stores the same bytes. A word typed again stays plain. */
export function restoreMentions(edited: string, draft: EditDraft): string {
  const seen = new Map<string, number>();
  let out = "";
  let cursor = 0;
  for (const { index, word } of occurrences(edited, [...draft.links.keys()])) {
    const k = seen.get(word) ?? 0;
    seen.set(word, k + 1);
    const link = draft.links.get(word)?.[k] ?? null;
    out += edited.slice(cursor, index) + (link ?? word);
    cursor = index + word.length;
  }
  return out + edited.slice(cursor);
}
