import { Dimensions, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useShell } from "./ShellContext";

/**
 * The width at which a device is a tablet rather than a large phone. **Under Android's
 * 600 on purpose**: `useWindowDimensions` reports the window, a fraction short.
 */
export const TABLET_MIN_WIDTH = 585;

/** The width at which the channel list becomes a column you keep. iPhone Duo open and upright is 669. */
export const TWO_PANE_MIN_WIDTH = 640;

/** How wide the channel column is. It also carries the server header, voice and the direct messages. */
export const SIDEBAR_WIDTH = 232;

/** The server list beside the channel column when held sideways. */
export const SERVER_RAIL_WIDTH = 64;

/** Sideways there is room to keep the members open, as the desktop does. */
export const MEMBERS_COLUMN_WIDTH = 176;

/**
 * Whether there is tablet room to work with, and nothing more. The looser threshold,
 * or a 7-inch tablet opens on the phone's first-launch screen.
 */
export function useWideScreen(): boolean {
  return useWindowDimensions().width >= TABLET_MIN_WIDTH;
}

/**
 * Whether to show the channel list beside a channel. With no servers there is no list
 * to put in the column, and splitting anyway wasted two thirds of an iPad.
 */
export function useTwoPane(): boolean {
  const wide = useWindowDimensions().width >= TWO_PANE_MIN_WIDTH;
  const { servers } = useShell();
  return wide && servers.length > 0;
}

/**
 * How wide iPhone Duo's side strip is, or 0. A landscape phone insets both sides for its
 * notch; only the strip insets one, so the left inset is what tells them apart.
 */
export function useSideStrip(): number {
  const { left, right } = useSafeAreaInsets();
  return Platform.OS === "ios" && left === 0 ? right : 0;
}

/** Whether the members stay open beside the channel. Upright a third column leaves the chat too narrow. */
export function useMembersColumn(): boolean {
  const { width, height } = useWindowDimensions();
  return useTwoPane() && width > height;
}

/** A page reached from You. Open, it swaps in beside your card rather than covering it. */
export function youPage(path: `/${string}`): `/${string}` {
  return Dimensions.get("window").width >= TWO_PANE_MIN_WIDTH ? `/you${path}` : path;
}
