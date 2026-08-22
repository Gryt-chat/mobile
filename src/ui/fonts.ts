import type { TextStyle } from "react-native";

/**
 * Atkinson Hyperlegible, which is what Gryt is set in.
 *
 * The desktop client sets `Atkinson Hyperlegible Next` on `<html>` and
 * `Atkinson Hyperlegible Mono` as its code face. This app loaded no font at all
 * until now — one `fontFamily` in the whole codebase — so every `Text` fell
 * back to SF Pro on iOS and Roboto on Android, and the two clients did not look
 * like the same product.
 *
 * **The files are not the desktop's.** Its are variable woff2, which React
 * Native cannot load at all. These are the same source instanced into static
 * TTFs at the weights the app actually uses — 400/500/600/700/800 for the text
 * face, 400/600 for the mono one. Seven faces, about 115 KB.
 *
 * **One family per weight, rather than one family with seven weights in it.**
 * Grouping them and letting `fontWeight` pick would be tidier and does work on
 * iOS, where the OS reads the name table and assembles the family itself.
 * Android does not: a custom family there needs an XML definition per weight,
 * and a `fontWeight` it cannot satisfy is silently ignored rather than
 * synthesised. Naming each face and choosing it here is the version that
 * behaves the same on both.
 */

/** What `useFonts` is given. The keys are the names `fontFamily` then takes. */
export const FONT_ASSETS = {
  "AtkinsonHyperlegibleNext-Regular": require("../../assets/fonts/AtkinsonHyperlegibleNext-Regular.ttf"),
  "AtkinsonHyperlegibleNext-Medium": require("../../assets/fonts/AtkinsonHyperlegibleNext-Medium.ttf"),
  "AtkinsonHyperlegibleNext-SemiBold": require("../../assets/fonts/AtkinsonHyperlegibleNext-SemiBold.ttf"),
  "AtkinsonHyperlegibleNext-Bold": require("../../assets/fonts/AtkinsonHyperlegibleNext-Bold.ttf"),
  "AtkinsonHyperlegibleNext-ExtraBold": require("../../assets/fonts/AtkinsonHyperlegibleNext-ExtraBold.ttf"),
  "AtkinsonHyperlegibleMono-Regular": require("../../assets/fonts/AtkinsonHyperlegibleMono-Regular.ttf"),
  "AtkinsonHyperlegibleMono-SemiBold": require("../../assets/fonts/AtkinsonHyperlegibleMono-SemiBold.ttf"),
};

/**
 * The face for a weight.
 *
 * Anything under 400 lands on Regular because no lighter face is shipped —
 * drawing 200 in Regular is a smaller lie than dropping to the system font for
 * that one line. 900 lands on ExtraBold for the same reason: the variable axis
 * stops at 800.
 */
export function textFace(weight: TextStyle["fontWeight"]): string {
  const n = weightNumber(weight);
  if (n >= 800) return "AtkinsonHyperlegibleNext-ExtraBold";
  if (n >= 700) return "AtkinsonHyperlegibleNext-Bold";
  if (n >= 600) return "AtkinsonHyperlegibleNext-SemiBold";
  if (n >= 500) return "AtkinsonHyperlegibleNext-Medium";
  return "AtkinsonHyperlegibleNext-Regular";
}

/** The code face. Two weights, which is all the app asks for. */
export function monoFace(weight: TextStyle["fontWeight"]): string {
  return weightNumber(weight) >= 600
    ? "AtkinsonHyperlegibleMono-SemiBold"
    : "AtkinsonHyperlegibleMono-Regular";
}

/**
 * A weight as a number.
 *
 * `"bold"` is 700 and `"normal"` is 400, per the CSS values React Native takes.
 * `undefined` is 400 as well — an unstyled `Text` is regular.
 */
function weightNumber(weight: TextStyle["fontWeight"]): number {
  if (weight === undefined || weight === null || weight === "normal") return 400;
  if (weight === "bold") return 700;
  const n = typeof weight === "number" ? weight : Number.parseInt(weight, 10);
  return Number.isFinite(n) ? n : 400;
}
