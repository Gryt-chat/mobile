import { useEffect, useState } from "react";
import {
  cardPattern,
  DEFAULT_EMOJI,
  GRYT_MARK,
  owlMark,
  unicodeEmojiMark,
  type CardStyle,
  type PatternMark,
} from "@gryt/ui/card-core";
import type { Tile } from "@gryt/ui/card-tiles";

let tiles: Promise<Map<string, Tile>> | null = null;

/** Every tile's paths, parsed the first time a card needs one rather than at launch. */
function loadTiles(): Promise<Map<string, Tile>> {
  tiles ??= import("@gryt/ui/card-tiles").then((m) => new Map(m.TILES.map((t) => [t.id, t])));
  return tiles;
}

/** A server emoji as a mark: fetched once and inlined, since the pattern is one SVG. */
async function imageMark(url: string): Promise<PatternMark | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  if (!data.startsWith("data:image/")) return null;
  return {
    viewBox: "0 0 100 100",
    body: `<image href='${data}' width='100' height='100' preserveAspectRatio='xMidYMid meet'/>`,
    mono: false,
    tint: false,
  };
}

/**
 * What a pattern needs besides the style: a tile's paths or the mark it strews. The icon
 * pattern draws nothing here yet, because the icons are Phosphor's web components.
 */
export function usePatternParts(
  style: CardStyle,
  owl: { nickname: string; worn?: string | null },
  /** This server's custom emoji, name to image, for a `server:` emoji. */
  customEmojis: ReadonlyMap<string, string>,
): { tile?: Tile; mark?: PatternMark } {
  const [parts, setParts] = useState<{ tile?: Tile; mark?: PatternMark }>({});
  const pattern = cardPattern(style.pattern);
  const emojiId = style.pEmoji ?? DEFAULT_EMOJI;
  const emojiUrl = emojiId.startsWith("server:") ? customEmojis.get(emojiId.slice(7)) : undefined;

  useEffect(() => {
    let live = true;
    const set = (next: { tile?: Tile; mark?: PatternMark }) => live && setParts(next);
    if (pattern.kind === "tile") void loadTiles().then((all) => set({ tile: all.get(pattern.id) }));
    else if (pattern.id === "gryt-faces") set({ mark: { ...GRYT_MARK, mono: false } });
    else if (pattern.id === "my-owl") set({ mark: owlMark(owl.nickname, owl.worn) ?? undefined });
    else if (pattern.id === "emoji" && emojiId.startsWith("unicode:")) set({ mark: unicodeEmojiMark(emojiId.slice(8)) });
    else if (pattern.id === "emoji" && emojiUrl) {
      void imageMark(emojiUrl)
        .then((mark) => set({ mark: mark ?? unicodeEmojiMark(DEFAULT_EMOJI.slice(8)) }))
        .catch(() => set({ mark: unicodeEmojiMark(DEFAULT_EMOJI.slice(8)) }));
    } else if (pattern.id === "emoji") set({ mark: unicodeEmojiMark(DEFAULT_EMOJI.slice(8)) });
    else set({});
    return () => {
      live = false;
    };
  }, [pattern.id, pattern.kind, emojiId, emojiUrl, owl.nickname, owl.worn]);

  return parts;
}
