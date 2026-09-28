import { gemoji } from "gemoji";

/**
 * One emoji, standard or a server's own. What the picker, the grid and search all pass
 * around, so a cell is drawn the same way wherever it came from.
 */
export interface EmojiEntry {
  name: string;
  emoji: string | null;
  isCustom: boolean;
  url?: string;
  tags: string[];
  aliases: string[];
}

/** The desktop picker's own icons, one per `gemoji` category, so the two read alike. */
export const CATEGORY_ICONS: Record<string, string> = {
  "Recently Used": "\u{1F550}",
  Custom: "⭐",
  "Smileys & Emotion": "\u{1F600}",
  "People & Body": "\u{1F44B}",
  "Animals & Nature": "\u{1F43E}",
  "Food & Drink": "\u{1F355}",
  "Travel & Places": "✈️",
  Activities: "⚽",
  Objects: "\u{1F4A1}",
  Symbols: "\u{1F49C}",
  Flags: "\u{1F3C1}",
};

let byCategory: Map<string, EmojiEntry[]> | null = null;

/** Every standard emoji, one entry per character, grouped the way `gemoji` categorises it. */
export function getStandardEmojisByCategory(): Map<string, EmojiEntry[]> {
  if (byCategory) return byCategory;
  byCategory = new Map();
  const seen = new Set<string>();
  for (const g of gemoji) {
    if (seen.has(g.emoji)) continue;
    seen.add(g.emoji);
    const list = byCategory.get(g.category) ?? [];
    list.push({ name: g.names[0], emoji: g.emoji, isCustom: false, tags: g.tags, aliases: g.names.slice(1) });
    byCategory.set(g.category, list);
  }
  return byCategory;
}

let standardFlat: EmojiEntry[] | null = null;
function allStandard(): EmojiEntry[] {
  if (!standardFlat) standardFlat = [...getStandardEmojisByCategory().values()].flat();
  return standardFlat;
}

const enum MatchTier {
  ExactPrefix = 0,
  WordBoundary = 1,
  Substring = 2,
  TagOrAlias = 3,
}

/**
 * Standard and custom together, ranked the way the desktop's picker does — an exact
 * prefix first, then a word start, then anywhere in the name, then a tag or old name.
 */
export function searchEmojis(query: string, custom: EmojiEntry[]): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { entry: EmojiEntry; tier: MatchTier }[] = [];
  for (const entry of [...custom, ...allStandard()]) {
    const name = entry.name.toLowerCase();
    if (name.startsWith(q)) scored.push({ entry, tier: MatchTier.ExactPrefix });
    else if (name.split(/[_-]/).some((p) => p.startsWith(q))) scored.push({ entry, tier: MatchTier.WordBoundary });
    else if (name.includes(q)) scored.push({ entry, tier: MatchTier.Substring });
    else if (entry.tags.some((t) => t.toLowerCase().startsWith(q)) || entry.aliases.some((a) => a.toLowerCase().startsWith(q))) {
      scored.push({ entry, tier: MatchTier.TagOrAlias });
    }
  }

  scored.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.entry.name.localeCompare(b.entry.name)));
  return scored.map((s) => s.entry);
}

/** What tapping a cell reacts with — the character itself, or a custom emoji's shortcode. */
export function reactionSrcFor(entry: EmojiEntry): string {
  return entry.isCustom ? `:${entry.name}:` : entry.emoji ?? `:${entry.name}:`;
}
