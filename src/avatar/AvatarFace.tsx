import { SvgXml } from "react-native-svg";

import { avatarSeed, generatedAvatarSvg } from "./generatedAvatar";

/**
 * Someone's generated owl, drawn in the app. `react-native-svg` rather than an `Image`,
 * which cannot decode SVG from a data URI. The owl fills its frame and brings its own
 * background, so the container's round clip is enough.
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
