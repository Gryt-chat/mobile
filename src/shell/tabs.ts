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
 * How far past the first page a right-drag has to pull to open the servers.
 *
 * In pages, after `RESIST` has been applied — so with resistance at a quarter,
 * this is reached about four tenths of the way across the screen, or sooner
 * with a flick behind it. Far enough that the rubber-band at the edge still
 * reads as an edge, near enough that it does not need a deliberate haul.
 */
export const SWITCHER_PULL = 0.1;

/**
 * Whether a release should open the server drawer.
 *
 * **Not simply "the throw went negative".** `thrown` has velocity added to it
 * without being clamped first, so a hard right flick from the search page
 * produces a large negative number on its way to being clamped back to the
 * first page — and taking that as the signal opens the drawer from the middle
 * of the app, which is not what the finger asked for.
 *
 * So it is: you were already on the first page, you are staying there, and you
 * pulled further anyway. That last part is only expressible past the edge,
 * which is exactly what the drawer is on the other side of.
 *
 * A worklet — the gesture lands on the UI thread.
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
