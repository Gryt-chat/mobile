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
 * **The files are not the desktop's.** Its are variable woff2. These are the
 * same source instanced into static faces at the weights the app uses —
 * 400/500/600/700/800 upright, 400/700 italic, and 400/600 for the mono one.
 * Nine faces, about 400 KB. `scripts/fonts.py` builds them and is the only
 * thing that should.
 *
 * **They are TrueType now, which they were not before.** The first seven were
 * instanced and saved with the woff2 flavour still on them: `.ttf` on the name
 * and `wOF2` in the first four bytes. iOS reads that — CoreText has taken woff2
 * since iOS 13 — so it looked right on the only platform it was checked on.
 * Android takes `.ttf` and `.otf` and nothing else, and a face it cannot parse
 * is one that never registers: no error, every `fontFamily` naming it falls
 * through to Roboto, and the app reads as though nobody had styled it.
 *
 * **One family per weight, rather than one family with seven weights in it.**
 * Grouping them and letting `fontWeight` pick would be tidier and does work on
 * iOS, where the OS reads the name table and assembles the family itself.
 * Android does not: a custom family there needs an XML definition per weight,
 * and a `fontWeight` it cannot satisfy is silently ignored rather than
 * synthesised. Naming each face is the version that behaves the same on both.
 *
 * **Choosing between them is the theme's job now, not this file's.**
 * `@gryt/ui-native` 0.12 takes these names on its provider and resolves a
 * weight to a face for every `Text` it draws — which is what closes the seam
 * this app had, where its own screens were in Atkinson and every Button label
 * and Dialog title was not. What is left here is the assets and their names.
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
