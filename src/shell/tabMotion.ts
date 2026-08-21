import { Easing } from "react-native-reanimated";

/* The bar and the pager's motion, split from `tabs.ts` for one reason: this
 * import reaches `react-native-worklets`, which vitest cannot load. Keeping it
 * out of `tabs.ts` is what lets the decisions in there have tests.
 */

/** Matches the Drawer's curve, so the app has one way of moving. */
export const TRAVEL = { duration: 260, easing: Easing.bezier(0.32, 0.72, 0, 1) };
