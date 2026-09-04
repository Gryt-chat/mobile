import type { TextStyle } from "react-native";

/**
 * Atkinson Hyperlegible, which is what Gryt is set in.
 *
 * **The files are not the desktop's variable woff2.** They are the same source
 * instanced into static faces at the weights the app uses — nine faces, about
 * 400 KB. **`scripts/fonts.py` builds them and is the only thing that should.**
 *
 * **They have to be real TrueType.** Instanced with the woff2 flavour still on
 * them they carry `.ttf` on the name and `wOF2` in the first four bytes, which
 * CoreText reads and Android does not — and a face Android cannot parse never
 * registers, with no error, so every `fontFamily` falls through to Roboto.
 *
 * **One family per weight, not one family with seven weights in it.** Grouping
 * works on iOS, where the OS assembles the family from the name table; Android
 * needs an XML definition per weight and silently ignores a `fontWeight` it
 * cannot satisfy.
 *
 * Choosing between them is `@gryt/ui-native`'s job. What is left here is the
 * assets and their names.
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
 * The names, in the shape `GrytThemeProvider` takes.
 *
 * The keys are the library's weight rungs; the values are what `useFonts`
 * registered above, and the two lists have to stay in step — a name here that
 * was not loaded is a `Text` that silently falls back to the platform font.
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
 * The italics, which the theme has no rung for.
 *
 * `FontFaces` is a weight ramp — regular through extrabold, plus the two mono
 * faces — and slant is not a weight. So `theme.font()` cannot return one and
 * these are named directly by whoever needs them, which today is the markdown
 * in a message and nothing else.
 *
 * **`fontStyle: "italic"` is not the way to ask for them.** Once a `fontFamily`
 * names a specific upright face, iOS draws that face and ignores the request,
 * and Android has no italic to synthesise from a single static file either. So
 * an emphasised word came out looking exactly like the words around it — the
 * mark parsed, rendered, and disappeared. Naming the face is what makes it
 * visible.
 */
export const GRYT_ITALICS = {
  regular: "AtkinsonHyperlegibleNext-Italic",
  bold: "AtkinsonHyperlegibleNext-BoldItalic",
} as const;
