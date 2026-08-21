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
import planetsDefinition from "@dicebear/styles/planets.json";

// Constructed once. A Style parses and validates its definition, and DiceBear's
// own docs say to reuse it across avatars rather than rebuild it per render.
const moods = new Style(moodsDefinition);
const planets = new Style(planetsDefinition);

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

/**
 * `seed`'s face as a hard circle, for places that want a tile rather than a
 * silhouette.
 *
 * Moods draws a head shape on transparency, which is right on the web where an
 * avatar sits on a surface and the shape reads as a face. In a tab bar beside
 * round glyphs it reads as a blob with ragged edges.
 *
 * So: a disc of the face's own colour behind it, and everything clipped to that
 * disc. Painting it in the face's colour rather than a neutral is what keeps it
 * one shape — a grey disc behind a peach face is two, with a visible ring
 * between them, which is the exact thing the web's transparent background
 * exists to avoid.
 */
export function generatedAvatarDiscSvg(seed: string): string {
  const svg = generatedAvatarSvg(seed);
  const colour = generatedAvatarColour(seed) ?? "#888888";

  /* DiceBear emits a square viewBox; the disc is inscribed in it. Falling back
   * to 100 rather than throwing, because a missing viewBox should cost a
   * slightly wrong crop and not a blank tab icon. */
  const box = /viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg);
  const size = box ? Number(box[1]) : 100;
  const r = size / 2;

  const open = svg.indexOf(">") + 1;
  const close = svg.lastIndexOf("</svg>");
  const head = svg.slice(0, open);
  const body = svg.slice(open, close);

  return (
    head +
    `<defs><clipPath id="gryt-disc"><circle cx="${r}" cy="${r}" r="${r}"/></clipPath></defs>` +
    `<g clip-path="url(#gryt-disc)">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${colour}"/>` +
    body +
    `</g></svg>`
  );
}

/**
 * The same idea for a server that has not set an icon, in a style that is not a
 * face.
 *
 * Planets rather than Moods, copied from the web client along with the reason:
 * a server is not a person, and drawing one as a person is what made a generated
 * fallback look wrong here.
 *
 * Seeded on the server's **name**, not its address. A server is the thing it
 * calls itself, so renaming it changes the planet — which is also what lets a
 * create form draw an icon before the server exists. The cost, accepted on the
 * web and inherited here, is that two servers both called "My Server" draw the
 * same planet.
 *
 * No background palette, unlike the faces. Planets brings its own night sky, and
 * forcing the tile pastels onto it would light the sky the same colour as
 * somebody's avatar for no reason.
 */
export function generatedServerIconSvg(seed: string): string {
  const key = `server:${seed}`;
  const cached = svgCache.get(key);
  if (cached) return cached;

  const svg = new Avatar(planets, { seed }).toString();
  svgCache.set(key, svg);
  return svg;
}
