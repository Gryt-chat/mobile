/* The bar and the pager's shared language, and no animation in it: `TRAVEL` pulled
 * in reanimated, which vitest cannot load. **Keep this file importable from a test.** */

/** What each *page* is. The bar has a fourth slot that is not one. */
export type TabKey = "(server)" | "search" | "you";

/** The three pages, in bar order, with the route each one is. */
export const TABS: { key: TabKey; href: string }[] = [
  { key: "(server)", href: "/(tabs)/(server)" },
  { key: "search", href: "/(tabs)/search" },
  { key: "you", href: "/(tabs)/you" },
];

/**
 * Which tab a route is on, or null when it is not on one. **Null rather than 0 for a
 * route outside the tabs**, which slid the pager home under a modal (GRYT-491).
 */
export function tabIndexOf(segments: string[]): number | null {
  const index = TABS.findIndex((tab) => segments.includes(tab.key));
  return index === -1 ? null : index;
}

/**
 * Every slot in the bar. One per page since GRYT-948, when the phone left the bar.
 * Only the count matters here; it is what the bar's geometry divides by.
 */
export const SLOT_COUNT = 3;

/**
 * Which slot each page's capsule sits in — the identity, since the phone left the bar.
 * It stays because **slots are the shared language between bar and pager**.
 */
export const PAGE_SLOT = [0, 1, 2];

/**
 * How far a flick carries past where the finger left it, in seconds of its own
 * velocity. Whatever is nearest once the throw is added on is where it lands.
 */
export const FLICK = 0.2;

/**
 * The nearest slot that is actually a page, and which page that is. A worklet, since
 * both gestures land on the UI thread. A rounding, now that every slot is a page.
 */
export function nearestPage(slot: number): { slot: number; page: number } {
  "worklet";
  const page = Math.min(Math.max(Math.round(slot), 0), PAGE_SLOT.length - 1);
  return { slot: PAGE_SLOT[page], page };
}

/**
 * Whether a channel is open on top of the server tab — asked by the horizontal swipe
 * and by pressing the tab you are on. Read off the segments, not a second copy.
 */
export function channelIsOpen(segments: string[]): boolean {
  return segments.includes("(server)") && segments.includes("channel");
}

/**
 * How far past the first page a right-drag has to pull to open the servers, in pages
 * after `RESIST`. About four tenths of the screen, or sooner with a flick.
 */
export const SWITCHER_PULL = 0.1;

/**
 * Whether a release should open the server drawer. **Not simply "the throw went
 * negative"**: `thrown` has velocity added before clamping. A worklet.
 */
export function pullsOpenServers({
  index,
  settledPage,
  thrown,
}: {
  /** The page showing when the finger went down. */
  index: number;
  /** Where the release lands, after the throw and the clamp. */
  settledPage: number;
  /** Where the release points before clamping, in pages. */
  thrown: number;
}): boolean {
  "worklet";
  return index === 0 && settledPage === 0 && thrown <= -SWITCHER_PULL;
}
