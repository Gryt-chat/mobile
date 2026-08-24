/**
 * A generated avatar for anyone who has not set one, and an icon for any server
 * that has not either.
 *
 * People get an owl, from `@gryt/owl`. The same package the desktop client
 * draws from, at the same version, which is the whole requirement: a person
 * recognised on the desktop has to be the same person here. This used to be a
 * copy of the web client's file, kept in step by hand and by a test pinning its
 * hashes, and the two had already drifted — the desktop drew owls while this
 * still drew DiceBear Moods, and the test went on passing because the hashes it
 * compared against were copied constants rather than the other client's output.
 *
 * Servers still get DiceBear's Planets. A server is not a person and should not
 * be drawn as one, which is why it was a different style to begin with. Planets
 * is CC0, so no deployment inherits an attribution obligation it did not choose.
 *
 * Planets renders locally through `@dicebear/core` rather than through
 * api.dicebear.com. The seed is a server's name, so calling the API would post
 * it to a third party on every render, and a self-hosted Gryt with no internet
 * would show nothing at all.
 *
 * What is not shared with the web is how the result is drawn. The web hands an
 * SVG data URI to an `<img>`. React Native's `Image` cannot decode SVG at all,
 * so this exposes the raw markup and the caller renders it with
 * `react-native-svg`. See `AvatarFace`.
 */

import { Avatar, Style } from "@dicebear/core";
import planetsDefinition from "@dicebear/styles/planets.json";
import { avatarSeed, owlAvatarColour, owlAvatarSvg, TILE_HUES } from "@gryt/owl";

// Constructed once. A Style parses and validates its definition, and DiceBear's
// own docs say to reuse it across avatars rather than rebuild it per render.
const planets = new Style(planetsDefinition);

// Re-exported rather than re-derived. Both are the package's, and that is the
// point: two apps that write out the seed rule separately are two apps that can
// disagree about whether "Sivert" and "sivert" are one person.
export { avatarSeed, TILE_HUES };

const svgCache = new Map<string, string>();

/**
 * `seed`'s owl, as SVG markup for `react-native-svg`.
 *
 * Cached because these render in lists that repaint often, and generating the
 * same markup per row per paint is wasteful. The seed is stable, so the result
 * never needs invalidating.
 *
 * Passed through untouched. Anything done to the string here is something the
 * desktop does not do, and the owl stops being the same owl.
 */
export function generatedAvatarSvg(seed: string): string {
  const cached = svgCache.get(seed);
  if (cached) return cached;

  const svg = owlAvatarSvg(seed);
  svgCache.set(seed, svg);
  return svg;
}

/**
 * The colour `seed`'s owl is drawn on, as `#rrggbb`.
 *
 * The colour the generator used, rather than something sampled back out of the
 * markup, so a voice tile tinted from it matches the avatar on it exactly.
 * Nothing tints a tile here yet — the desktop does, in `speakingIndicator.ts` —
 * and this is what it will want when it does.
 */
export function generatedAvatarColour(seed: string): string {
  return owlAvatarColour(seed);
}

/**
 * The same idea for a server that has not set an icon, in a style that is not a
 * face.
 *
 * Seeded on the server's **name**, not its address. A server is the thing it
 * calls itself, so renaming it changes the planet — which is also what lets a
 * create form draw an icon before the server exists. The cost, accepted on the
 * web and inherited here, is that two servers both called "My Server" draw the
 * same planet.
 *
 * No palette forced onto it, unlike the owls. Planets brings its own night sky,
 * and painting the tile hues over it would light the sky the same colour as
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
