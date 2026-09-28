import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";

import { qrPath } from "./qrPath";

/** Black on white whatever the theme, with the four-module quiet zone scanners expect. */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const { size: modules, path } = useMemo(() => qrPath(value), [value]);
  const box = modules + 8;
  return (
    <Svg width={size} height={size} viewBox={`-4 -4 ${box} ${box}`} accessibilityLabel={label} accessible>
      <Rect x={-4} y={-4} width={box} height={box} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
