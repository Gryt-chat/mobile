/**
 * A generated face for anyone who has not set an avatar.
 *
 * The same face the web client draws, and that is the whole requirement: a
 * person recognised on the desktop has to be the same person here. So the style,
 * the seed, the palette and the arithmetic that picks a colour are all copied
 * from `client/src/packages/common/src/utils/generatedAvatar.ts` rather than
 * re-derived. Anything cleverer gives one person two faces.
 *
 * Rendered locally through `@dicebear/core`, not `api.dicebear.com`. That is a
 * decision inherited from the web and worth keeping: the seed is a nickname, so
 * the API would post a real person's name to a third party on every render, and
 * a self-hosted Gryt with no internet would show nothing at all.
 *
 * Moods and Planets are CC0, so no deployment inherits an attribution
 * obligation. Several nicer DiceBear styles are CC BY, which would.
 *
 * What is *not* shared with the web is how the result is drawn. The web hands an
 * SVG data URI to an `<img>`. React Native's `Image` cannot decode SVG at all,
 * so this exposes the raw markup as well and the caller renders it with
 * `react-native-svg`. See `useAvatarPng` for the tab bar, which needs a third
 * thing again.
 */

import { Avatar, Style } from "@dicebear/core";
import moodsDefinition from "@dicebear/styles/moods.json";

// Constructed once. A Style parses and validates its definition, and DiceBear's
// own docs say to reuse it across avatars rather than rebuild it per render.
const moods = new Style(moodsDefinition);

/**
 * The hues a voice tile is drawn in.
 *
 * Copied from the web, where the comment explains the curation: free hue lands
 * in the yellow-green band often enough to matter, and those come out muddy at
 * the lightness a tile needs.
 */
export const TILE_HUES = [280, 24, 170, 330, 210, 140, 350, 45, 260, 195];

/** A pastel at `hue`, light enough to draw a face on. */
function pastel(hue: number): string {
  const c = 0.24;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.68;

  const [r, g, b] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x];

  return [r, g, b]
    .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
    .join("");
}

const AVATAR_COLOURS = TILE_HUES.map(pastel);

/**
 * Moods draws a filled face that fills the frame, so the colour a person reads
 * as theirs is the face rather than anything behind it. Painting the background
 * too would put a ring of a second colour around every avatar.
 */
const TRANSPARENT = "00000000";

const svgCache = new Map<string, string>();
const colourCache = new Map<string, string>();

/**
 * The seed a person's face is drawn from: their nickname, normalised.
 *
 * Case and surrounding whitespace dropped, everything else kept — so "Sivert"
 * and " sivert " are one person and anything else is not. The nickname rather
 * than a per-server id, because an id is issued per server and the same person
 * would arrive in every server looking like somebody else.
 */
export function avatarSeed(nickname: string | null | undefined): string | undefined {
  const trimmed = nickname?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

/** `seed`'s face, as SVG markup for `react-native-svg`. */
export function generatedAvatarSvg(seed: string): string {
  const cached = svgCache.get(seed);
  if (cached) return cached;

  const { svg, options } = new Avatar(moods, {
    seed,
    faceColor: AVATAR_COLOURS,
    backgroundColor: [TRANSPARENT],
  }).toJSON();

  svgCache.set(seed, svg);

  const face = options.faceColor?.[0];
  if (typeof face === "string") colourCache.set(seed, face);

  return svg;
}

/**
 * The colour DiceBear drew `seed`'s face in, as `#rrggbb`.
 *
 * Read off the generator rather than sampled back out of the SVG, so a voice
 * tile tinted from it matches the face on it exactly.
 */
export function generatedAvatarColour(seed: string): string | undefined {
  if (!colourCache.has(seed)) generatedAvatarSvg(seed);
  return colourCache.get(seed);
}
