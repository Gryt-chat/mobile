import type { TextStyle } from "react-native";

/**
 * Atkinson Hyperlegible, as static faces built by `scripts/fonts.py`. **They have to be
 * real TrueType**, and **one family per weight** — Android is silent about both.
 */

/** What `useFonts` is given. The keys are the names `fontFamily` then takes. */
export const FONT_ASSETS = {
  "AtkinsonHyperlegibleNext-Regular": require("../../assets/fonts/AtkinsonHyperlegibleNext-Regular.ttf"),
  "AtkinsonHyperlegibleNext-Medium": require("../../assets/fonts/AtkinsonHyperlegibleNext-Medium.ttf"),
  "AtkinsonHyperlegibleNext-SemiBold": require("../../assets/fonts/AtkinsonHyperlegibleNext-SemiBold.ttf"),
  "AtkinsonHyperlegibleNext-Bold": require("../../assets/fonts/AtkinsonHyperlegibleNext-Bold.ttf"),
  "AtkinsonHyperlegibleNext-ExtraBold": require("../../assets/fonts/AtkinsonHyperlegibleNext-ExtraBold.ttf"),
  "AtkinsonHyperlegibleNext-Italic": require("../../assets/fonts/AtkinsonHyperlegibleNext-Italic.ttf"),
  "AtkinsonHyperlegibleNext-BoldItalic": require("../../assets/fonts/AtkinsonHyperlegibleNext-BoldItalic.ttf"),
  "AtkinsonHyperlegibleMono-Regular": require("../../assets/fonts/AtkinsonHyperlegibleMono-Regular.ttf"),
  "AtkinsonHyperlegibleMono-SemiBold": require("../../assets/fonts/AtkinsonHyperlegibleMono-SemiBold.ttf"),
};

/**
 * The names, in the shape `GrytThemeProvider` takes. The keys are the library's weight
 * rungs; a name here that was not loaded is a silent fallback to the platform font.
 */
export const GRYT_FONTS = {
  regular: "AtkinsonHyperlegibleNext-Regular",
  medium: "AtkinsonHyperlegibleNext-Medium",
  semibold: "AtkinsonHyperlegibleNext-SemiBold",
  bold: "AtkinsonHyperlegibleNext-Bold",
  extrabold: "AtkinsonHyperlegibleNext-ExtraBold",
  mono: "AtkinsonHyperlegibleMono-Regular",
  monoSemibold: "AtkinsonHyperlegibleMono-SemiBold",
} as const;

/**
 * The italics, which the theme has no rung for. **`fontStyle: "italic"` is not the way to
 * ask**: iOS ignores it on a static face and Android has nothing to synthesise from.
 */
export const GRYT_ITALICS = {
  regular: "AtkinsonHyperlegibleNext-Italic",
  bold: "AtkinsonHyperlegibleNext-BoldItalic",
} as const;
