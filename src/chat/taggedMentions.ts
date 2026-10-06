import { occurrences } from "./editMentions";
import type { TaggableMember } from "./nameTags";

/**
 * A shared name as the composer writes it once picked: `Gold·2xtQ`. A phone field
 * holds no pills, so the tag rides in the text until send turns it into the member's id.
 */
export function taggedWord(nickname: string, tag: string): string {
  return `${nickname}·${tag}`;
}

/** What `@` offers: a name two members share becomes one entry per member, tagged. */
export function pickableNames(
  names: string[],
  members: readonly TaggableMember[],
  tags: ReadonlyMap<string, string>,
): string[] {
  if (tags.size === 0) return names;
  const tagged = new Map<string, string[]>();
  for (const member of members) {
    const tag = tags.get(member.serverUserId);
    if (!tag) continue;
    const list = tagged.get(member.nickname) ?? [];
    list.push(taggedWord(member.nickname, tag));
    tagged.set(member.nickname, list);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    for (const word of tagged.get(name) ?? [name]) {
      if (seen.has(word)) continue;
      seen.add(word);
      out.push(word);
    }
  }
  return out;
}

/** Each picked `@Gold·2xtQ` as the link it stands for, `[@Gold](mention:<id>)`,
    so the ping reaches that Gold and the stored label is the plain name. */
export function linkTaggedMentions(
  text: string,
  members: readonly TaggableMember[],
  tags: ReadonlyMap<string, string>,
): string {
  if (tags.size === 0 || !text.includes("·")) return text;
  const links = new Map<string, string>();
  for (const member of members) {
    const tag = tags.get(member.serverUserId);
    if (tag) links.set(`@${taggedWord(member.nickname, tag)}`, `[@${member.nickname}](mention:${member.serverUserId})`);
  }
  let out = "";
  let cursor = 0;
  for (const { index, word } of occurrences(text, [...links.keys()])) {
    out += text.slice(cursor, index) + (links.get(word) ?? word);
    cursor = index + word.length;
  }
  return out + text.slice(cursor);
}
