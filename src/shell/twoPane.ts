import { useWindowDimensions } from "react-native";

import { useShell } from "./ShellContext";

/**
 * The width at which the channel list stops being a page you leave and becomes
 * a column you keep.
 *
 * 768 because that is the desktop client's own line — `useIsMobile()` in
 * `packages/client/src/packages/mobile/src/hooks/isMobile.ts` is `<= 768`, and
 * everything above it there already gets sidebars. Picking the same number
 * means a tablet held in portrait lands on the same side of the question in
 * both clients, rather than on whichever value this file happened to like.
 *
 * In practice: a 10-inch tablet is about 800dp in portrait and 1280 in
 * landscape, so it is two-pane either way round. A 7-inch is about 600 in
 * portrait, so it stays a phone until you turn it.
 */
export const TWO_PANE_MIN_WIDTH = 768;

/**
 * How wide the channel column is.
 *
 * The desktop sidebar is 240 (`useServerViewLayout.ts`) and this is wider on
 * purpose: that one carries channels alone, and this one carries the server
 * header, who is in voice, and the direct messages under them. At 240 the
 * header's name and switcher chevron start colliding.
 */
export const SIDEBAR_WIDTH = 320;

/**
 * Whether to show the channel list beside a channel.
 *
 * Width is most of it, but not all: with no servers joined there is no list to
 * put in the column. Splitting anyway squeezed "No servers yet" into 320 points
 * and left the other two thirds of an iPad saying "Pick a channel on the left",
 * next to nothing anybody could pick. Somewhere to go back to has to exist
 * before a column is worth spending the width on.
 */
export function useTwoPane(): boolean {
  const wide = useWindowDimensions().width >= TWO_PANE_MIN_WIDTH;
  const { servers } = useShell();
  return wide && servers.length > 0;
}
