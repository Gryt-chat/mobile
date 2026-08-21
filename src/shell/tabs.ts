import { Easing } from "react-native-reanimated";

/** What each *page* is. The bar has a fourth slot that is not one. */
export type TabKey = "(server)" | "search" | "you";

/** The three pages, in bar order, with the route each one is. */
export const TABS: { key: TabKey; href: string }[] = [
  { key: "(server)", href: "/(tabs)/(server)" },
  { key: "search", href: "/(tabs)/search" },
  { key: "you", href: "/(tabs)/you" },
];

/**
 * Every slot in the bar, including the one that is not a page.
 *
 * Four slots and three pages: the second is the phone, a button that brings a
 * call back rather than somewhere to go. Only the count matters — it is what
 * the bar's geometry divides by.
 */
export const SLOT_COUNT = 4;

/**
 * Which slot each page's capsule sits in. The gap at 1 is the phone.
 *
 * **Slots are the shared language between the bar and the pager**, and that is
 * a deliberate inversion of how this started. The shared value used to be the
 * page the row was showing, and the capsule converted to slots when it drew —
 * which works for a finger dragged across a page and cannot express a finger
 * dragged across the *bar*, because half of what that finger can point at is
 * not a page. So the value is the slot now, continuously, and the pager
 * converts back to find where to put the row.
 */
export const PAGE_SLOT = [0, 2, 3];

/** Matches the Drawer's curve, so the app has one way of moving. */
export const TRAVEL = { duration: 260, easing: Easing.bezier(0.32, 0.72, 0, 1) };

/**
 * How far a flick carries past where the finger left it, in seconds of its own
 * velocity. There is no separate threshold: whatever is nearest once the throw
 * is added on is where it lands.
 */
export const FLICK = 0.2;

/**
 * The nearest slot that is actually a page, and which page that is.
 *
 * A worklet, because both gestures land here on the UI thread. `Math.round`
 * would do if the slots were contiguous; they are not, and rounding to 1 would
 * settle the capsule on the phone.
 */
export function nearestPage(slot: number): { slot: number; page: number } {
  "worklet";
  let page = 0;
  for (let i = 1; i < PAGE_SLOT.length; i++) {
    if (Math.abs(PAGE_SLOT[i] - slot) < Math.abs(PAGE_SLOT[page] - slot)) page = i;
  }
  return { slot: PAGE_SLOT[page], page };
}
