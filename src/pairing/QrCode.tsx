import { qrArt } from "@gryt/core";
import { useId, useMemo } from "react";
import Svg, { Circle, ClipPath, Defs, Image, Path, Rect } from "react-native-svg";

import { qrModules } from "./qrModules";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro hands out bundled images through require
const ICON = require("../../assets/icon.png");

/** Black on white whatever the theme, drawn like the desktop's: dots, rounded corners and the owl in the middle. */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const art = useMemo(() => qrArt(qrModules(value)), [value]);
  const clip = useId();
  const box = art.size + 6;
  const logo = art.logo;
  return (
    <Svg width={size} height={size} viewBox={`-3 -3 ${box} ${box}`} accessibilityLabel={label} accessible>
      <Rect x={-3} y={-3} width={box} height={box} rx={3} fill="#ffffff" />
      <Path d={art.finders + art.dots} fill="#000000" />
      {logo && (
        <>
          <Defs>
            <ClipPath id={clip}>
              <Circle cx={logo.x + logo.size / 2} cy={logo.y + logo.size / 2} r={logo.size / 2} />
            </ClipPath>
          </Defs>
          <Image href={ICON} x={logo.x} y={logo.y} width={logo.size} height={logo.size} clipPath={`url(#${clip})`} />
        </>
      )}
    </Svg>
  );
}
