import { SvgXml } from "react-native-svg";

import { avatarSeed, generatedAvatarSvg } from "./generatedAvatar";

/**
 * Someone's generated owl, drawn in the app.
 *
 * `react-native-svg` rather than an `Image`, because the generator produces SVG
 * markup and React Native's `Image` cannot decode SVG from a data URI — the web
 * hands the same string to an `<img>` and it just works.
 *
 * There used to be a `disc` form that clipped the face into a circle of its own
 * colour, because Moods drew a head-shaped silhouette on transparency. The owl
 * fills its frame and brings its own background, so the container's own round
 * clip is enough.
 */
export function AvatarFace({
  name,
  size = 28,
}: {
  name: string | null | undefined;
  size?: number;
}) {
  const seed = avatarSeed(name);
  if (!seed) return null;

  return (
    <SvgXml
      xml={generatedAvatarSvg(seed)}
      width={size}
      height={size}
      accessibilityLabel={name ?? undefined}
    />
  );
}
