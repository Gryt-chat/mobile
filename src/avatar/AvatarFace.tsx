import { SvgXml } from "react-native-svg";

import { avatarSeed, generatedAvatarSvg } from "./generatedAvatar";

/**
 * Someone's generated face, drawn in the app.
 *
 * `react-native-svg` rather than an `Image`, because the generator produces SVG
 * markup and React Native's `Image` cannot decode SVG from a data URI — the web
 * hands the same string to an `<img>` and it just works, which is the one place
 * these two platforms genuinely differ.
 *
 * For the tab bar this is not enough either, and `useAvatarIcon` explains why.
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
