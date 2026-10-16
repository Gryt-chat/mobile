import { useId } from "react";
import Svg, { Circle, Defs, G, Mask, Path, Rect } from "react-native-svg";

/* Phosphor's ChatTeardropText (regular) and PushPin (fill), as the desktop draws them (GRYT-1783). */
const BUBBLE = ["M172,112a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h68A8,8,0,0,1,172,112Zm-8,24H96a8,8,0,0,0,0,16h68a8,8,0,0,0,0-16Zm68-12A100.11,100.11,0,0,1,132,224H48a16,16,0,0,1-16-16V124a100,100,0,0,1,200,0Zm-16,0a84,84,0,0,0-168,0v84h84A84.09,84.09,0,0,0,216,124Z"];
const PIN = ["M235.33,104l-53.47,53.65c4.56,12.67,6.45,33.89-13.19,60A15.93,15.93,0,0,1,157,224c-.38,0-.75,0-1.13,0a16,16,0,0,1-11.32-4.69L96.29,171,53.66,213.66a8,8,0,0,1-11.32-11.32L85,159.71l-48.3-48.3A16,16,0,0,1,38,87.63c25.42-20.51,49.75-16.48,60.4-13.14L152,20.7a16,16,0,0,1,22.63,0l60.69,60.68A16,16,0,0,1,235.33,104Z"];

/** A teardrop message with a pin cut into its corner, for the pinned messages list. */
export function PinnedMessagesIcon({ size = 20, color }: { size?: number; color: string }) {
  const mask = `pin-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill={color}>
      <Defs>
        <Mask id={mask}>
          <Rect width="256" height="256" fill="white" />
          <Circle cx="200" cy="58" r="80" fill="black" />
        </Mask>
      </Defs>
      <G mask={`url(#${mask})`}>
        {BUBBLE.map((d) => <Path key={d} d={d} />)}
      </G>
      <G transform="translate(140 -2) scale(0.47)">
        {PIN.map((d) => <Path key={d} d={d} />)}
      </G>
    </Svg>
  );
}
