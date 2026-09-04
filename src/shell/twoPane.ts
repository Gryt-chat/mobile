import { useWindowDimensions } from "react-native";

import { useShell } from "./ShellContext";

/**
 * The width at which a device is a tablet rather than a large phone. Android's
 * line is `sw600dp`.
 *
 * **The number here is under 600 on purpose.** `useWindowDimensions` reports the
 * *window*, which on a nominally 600dp device comes back a fraction short — so
 * comparing against 600 excludes the devices the line exists to catch. The
 * largest phones are around 430dp, so 585 reaches nothing by mistake.
 */
export const TABLET_MIN_WIDTH = 585;

/**
 * The width at which the channel list stops being a page you leave and becomes
 * a column you keep. 768 is the desktop's own threshold.
 *
 * **Higher than the tablet line, because the two answer different questions.**
 * Wide enough to place two panels side by side is not wide enough to give up
 * 320 points of every screen permanently — at 600 the conversation gets 280,
 * and the thing being squeezed is what you opened the app to read.
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
 * Whether there is tablet room to work with, and nothing more.
 *
 * Separate from `useTwoPane` because the first-launch screen needs the width
 * question without the server question — it is the screen you get *because*
 * there are no servers, so a hook that answers false without one is no use to
 * it.
 *
 * It is also the looser of the two thresholds, which is the point of having
 * both. Holding this to 768 as well meant a 7-inch tablet — 600dp in portrait,
 * a tablet by Android's own reckoning — opened on the phone's first-launch
 * screen. Accurate, and a waste of a screen that is plainly not a phone.
 */
export function useWideScreen(): boolean {
  return useWindowDimensions().width >= TABLET_MIN_WIDTH;
}

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
