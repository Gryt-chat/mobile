/* The bar and the pager's shared language, and no animation in it.
 *
 * `TRAVEL` used to live here and pulled `react-native-reanimated` in at the top
 * of the file, which pulls `react-native-worklets`, which vitest cannot load —
 * so nothing in here could be tested, including the decisions that most wanted
 * it. It is `tabMotion.ts` now. Keep this file importable from a test.
 */

/** What each *page* is. The bar has a fourth slot that is not one. */
export type TabKey = "(server)" | "search" | "you";

/** The three pages, in bar order, with the route each one is. */
export const TABS: { key: TabKey; href: string }[] = [
  { key: "(server)", href: "/(tabs)/(server)" },
  { key: "search", href: "/(tabs)/search" },
  { key: "you", href: "/(tabs)/you" },
];

/**
 * Which tab a route is on, or null when it is not on one at all.
 *
 * Read off the router's segments rather than kept in state beside them, because
 * a second copy of "which tab am I on" is a copy that can disagree with where
 * you actually are.
 *
 * **Null rather than 0 for a route outside the tabs**, which is the whole of
 * GRYT-491. `/dev`, `/identity` and `/preferences` are pushed on the *root*
 * stack, so their segments contain none of the three keys — and answering 0 for
 * them told the pager to go to the server tab, sliding the pager and the bar's
 * capsule home underneath a modal presenting over the top.
 *
 * It went unnoticed for the other two because they are full-screen pushes with
 * `animation: "none"`: the pager still reset, behind something that already
 * covered it.
 */
export function tabIndexOf(segments: string[]): number | null {
  const index = TABS.findIndex((tab) => segments.includes(tab.key));
  return index === -1 ? null : index;
}

/**
 * Every slot in the bar. One per page, since GRYT-948.
 *
 * It was four for three pages: the second was a phone that brought a call back,
 * drawn dead in an idle grey whenever there was no call — a quarter of the bar
 * spent on a button that mostly did nothing. It floats at the bottom right now,
 * and only while there is a call.
 *
 * Only the count matters here; it is what the bar's geometry divides by.
 */
export const SLOT_COUNT = 3;

/**
 * Which slot each page's capsule sits in.
 *
 * One to one since the phone left the bar, so this is the identity and the
 * conversions either side of it are too. It stays rather than being deleted
 * because it is the thing that says slots and pages are different ideas —
 * they were not the same list until GRYT-948 and a fourth button would part
 * them again.
 *
 * **Slots are the shared language between the bar and the pager.** The shared
 * value used to be the page the row was showing, which works for a finger
 * dragged across a page and could not express a finger dragged across the
 * *bar*, where some of what it passed over was not a page.
 */
export const PAGE_SLOT = [0, 1, 2];

/**
 * How far a flick carries past where the finger left it, in seconds of its own
 * velocity. There is no separate threshold: whatever is nearest once the throw
 * is added on is where it lands.
 */
export const FLICK = 0.2;

/**
 * The nearest slot that is actually a page, and which page that is.
 *
 * A worklet, because both gestures land here on the UI thread.
 *
 * A rounding, now that every slot is a page. This used to walk `PAGE_SLOT`
 * looking for the closest entry, and the comment above it said `Math.round`
 * would do if the slots were contiguous — they are, since the phone left the
 * bar, so it does. The clamp is what a flick past either end needs; the search
 * gave that away for free and rounding does not.
 */
export function nearestPage(slot: number): { slot: number; page: number } {
  "worklet";
  const page = Math.min(Math.max(Math.round(slot), 0), PAGE_SLOT.length - 1);
  return { slot: PAGE_SLOT[page], page };
}

/**
 * Whether a channel is open on top of the server tab.
 *
 * Two things ask. A horizontal swipe means "back to the channels" while one is
 * open rather than "next tab", and pressing the Server tab you are already on
 * means the same — both of which are only true when there is something to go
 * back to.
 *
 * Read off the segments for the same reason `tabIndexOf` is: a second copy of
 * "am I in a channel" is a copy that can disagree with where you actually are.
 */
export function channelIsOpen(segments: string[]): boolean {
  return segments.includes("(server)") && segments.includes("channel");
}

/**
 * How much of the screen the server drawer covers.
 *
 * The same number `ServerSwitcher` hands `Drawer.Popup` as its `size`, and it
 * has to be: the drag divides by it to make the panel travel with the finger
 * rather than ahead of or behind it. Two copies of this that disagree is a
 * drawer that lags the thumb by a fixed ratio, which reads as sluggishness
 * rather than as a number being wrong.
 */
export const SWITCHER_SIZE = 0.74;

/**
 * How far out the drag has brought the drawer, 0 shut to 1 open.
 *
 * `wanted` is where the row would be in pages if nothing resisted, so at the
 * first page a right-drag makes it negative and `-wanted` is the fraction of a
 * screen width the finger has travelled. Dividing by the drawer's own share of
 * the screen turns that into the panel's travel, which is what makes it move
 * one point for each point of finger.
 */
export function pullFraction(wanted: number): number {
  "worklet";
  return Math.max(0, Math.min(1, -wanted / SWITCHER_SIZE));
}

/**
 * Whether letting go here should leave the drawer open.
 *
 * Halfway, plus the throw. A flick that has barely moved still commits, which
 * is what makes a quick flick from the edge feel like the gesture it is; a slow
 * haul that stops short goes back.
 */
export function commitsPull(pull: number, velocity: number, extent: number): boolean {
  "worklet";
  const thrown = pull + (extent > 0 ? (velocity / extent) * FLICK : 0);
  return thrown >= 0.5;
}

