import { SvgXml } from "react-native-svg";

import { avatarSeed, generatedAvatarDiscSvg, generatedAvatarSvg } from "./generatedAvatar";

/**
 * Someone's generated face, drawn in the app.
 *
 * `react-native-svg` rather than an `Image`, because the generator produces SVG
 * markup and React Native's `Image` cannot decode SVG from a data URI — the web
 * hands the same string to an `<img>` and it just works, which is the one place
 * these two platforms genuinely differ.
 *
 * `disc` clips the face into a circle of its own colour. Raw Moods is a
 * head-shaped silhouette with ragged edges, which is right on a surface and
 * wrong beside round glyphs — see `generatedAvatarDiscSvg`.
 *
 * This used to have a third form for the tab bar, where the native icon took an
 * `ImageSourcePropType` and never an element, so the face had to be rasterised
 * offscreen through `toDataURL`. The bar is ours now (GRYT-458) and that whole
 * dance is gone.
 */
export function AvatarFace({
  name,
  size = 28,
  disc = false,
}: {
  name: string | null | undefined;
  size?: number;
  disc?: boolean;
}) {
  const seed = avatarSeed(name);
  if (!seed) return null;

  return (
    <SvgXml
      xml={disc ? generatedAvatarDiscSvg(seed) : generatedAvatarSvg(seed)}
      width={size}
      height={size}
      accessibilityLabel={name ?? undefined}
    />
  );
}
