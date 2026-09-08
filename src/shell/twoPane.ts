import { useWindowDimensions } from "react-native";

import { useShell } from "./ShellContext";

/**
 * The width at which a device is a tablet rather than a large phone. **The number is
 * under Android's 600 on purpose**: `useWindowDimensions` reports the window, which
 * comes back a fraction short. The largest phones are around 430dp.
 */
export const TABLET_MIN_WIDTH = 585;

/**
 * The width at which the channel list becomes a column you keep — the desktop's 768.
 * **Higher than the tablet line, because the two answer different questions**: at 600
 * the conversation gets 280 points.
 */
export const TWO_PANE_MIN_WIDTH = 768;

/**
 * How wide the channel column is. Wider than the desktop's 240, because this one also
 * carries the server header, voice and the direct messages.
 */
export const SIDEBAR_WIDTH = 320;

/**
 * Whether there is tablet room to work with, and nothing more. Separate from
 * `useTwoPane` because the first-launch screen needs the width question without the
 * server one — and it is the looser threshold, or a 7-inch tablet gets the phone screen.
 */
export function useWideScreen(): boolean {
  return useWindowDimensions().width >= TABLET_MIN_WIDTH;
}

/**
 * Whether to show the channel list beside a channel. Width is most of it: with no
 * servers there is no list to put in the column, and splitting anyway wasted two
 * thirds of an iPad on "Pick a channel on the left".
 */
export function useTwoPane(): boolean {
  const wide = useWindowDimensions().width >= TWO_PANE_MIN_WIDTH;
  const { servers } = useShell();
  return wide && servers.length > 0;
}
