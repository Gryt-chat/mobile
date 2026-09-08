/**
 * A generated avatar for anyone who has not set one, and an icon for any server that
 * has not either. **People get an owl from `@gryt/owl`, at the desktop's version**;
 * servers get DiceBear's Planets, rendered locally. `Image` cannot decode SVG.
 */

import { Avatar, Style } from "@dicebear/core";
import planetsDefinition from "@dicebear/styles/planets.json";
import { avatarSeed, owlAvatarColour, owlAvatarSvg, TILE_HUES } from "@gryt/owl";

// Constructed once. A Style parses and validates its definition, and DiceBear's
// own docs say to reuse it across avatars rather than rebuild it per render.
const planets = new Style(planetsDefinition);

// Re-exported rather than re-derived: two apps writing out the seed rule separately
// are two apps that can disagree about "Sivert" and "sivert".
export { avatarSeed, TILE_HUES };

const svgCache = new Map<string, string>();

/**
 * `seed`'s owl, as SVG markup for `react-native-svg`. Cached, since these render in
 * lists that repaint often. **Passed through untouched**, or it stops being the
 * same owl the desktop draws.
 */
export function generatedAvatarSvg(seed: string): string {
  const cached = svgCache.get(seed);
  if (cached) return cached;

  const svg = owlAvatarSvg(seed);
  svgCache.set(seed, svg);
  return svg;
}

/**
 * The colour `seed`'s owl is drawn on, as `#rrggbb` — the colour the generator used
 * rather than one sampled back out, so a tinted tile matches exactly.
 */
export function generatedAvatarColour(seed: string): string {
  return owlAvatarColour(seed);
}

/**
 * The same idea for a server that has not set an icon, in a style that is not a face.
 * Seeded on the **name**, not the address, so a rename changes the planet. No palette
 * forced onto it: Planets brings its own night sky.
 */
export function generatedServerIconSvg(seed: string): string {
  const key = `server:${seed}`;
  const cached = svgCache.get(key);
  if (cached) return cached;

  const svg = new Avatar(planets, { seed }).toString();
  svgCache.set(key, svg);
  return svg;
}
