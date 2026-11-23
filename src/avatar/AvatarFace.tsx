import { parse, SvgAst } from "react-native-svg";

import { avatarSeed, generatedAvatarSvg } from "./generatedAvatar";

/**
 * Someone's generated owl, drawn in the app. `react-native-svg` rather than an `Image`,
 * which cannot decode SVG from a data URI. The owl brings its own background.
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

  return <SvgAst ast={astFor(seed)} override={{ width: size, height: size, accessibilityLabel: name ?? undefined }} />;
}

/* SvgXml parses its string on every mount; a channel draws the same few faces dozens of times. */
const asts = new Map<string, ReturnType<typeof parse>>();
function astFor(seed: string): ReturnType<typeof parse> {
  let ast = asts.get(seed);
  if (ast === undefined) {
    ast = parse(generatedAvatarSvg(seed));
    if (asts.size >= 500) asts.clear();
    asts.set(seed, ast);
  }
  return ast;
}
