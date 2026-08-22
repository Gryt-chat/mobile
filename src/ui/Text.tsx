import { forwardRef } from "react";
import {
  Text as RNText,
  StyleSheet,
  type TextProps as RNTextProps,
  type TextStyle,
} from "react-native";

import { monoFace, textFace } from "./fonts";

export interface TextProps extends RNTextProps {
  /**
   * Draw this in the code face.
   *
   * A prop rather than a separate component, because the only difference is
   * which family a weight resolves to and everything else about the two is the
   * same.
   */
  mono?: boolean;
}

/**
 * `Text`, in Gryt's typeface.
 *
 * React Native has no cascade: a font set on a parent does not reach the text
 * inside it, so there is no root rule to write and every `Text` has to name its
 * own family. This is that, done once — the app imports `Text` from here rather
 * than from `react-native` and keeps writing `fontWeight` the way it always
 * has.
 *
 * The weight has to be read before the family can be chosen, which is why the
 * style is flattened here. `StyleSheet.flatten` handles the array form and the
 * registered-style-id form, both of which the app uses.
 *
 * **A `fontFamily` already in the style wins.** The report screen deliberately
 * draws in Menlo, and a wrapper that overrode it would be a wrapper you have to
 * work around.
 */
export const Text = forwardRef<RNText, TextProps>(function GrytText(
  { style, mono = false, ...props },
  ref,
) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;

  if (flat?.fontFamily) {
    return <RNText ref={ref} style={style} {...props} />;
  }

  const fontFamily = mono ? monoFace(flat?.fontWeight) : textFace(flat?.fontWeight);

  /* The resolved family goes *after* the caller's style so it is the one that
   * lands, and `fontWeight` is dropped with it: the face already carries the
   * weight, and leaving the number on would ask the platform to synthesise a
   * bolder version of an already-bold file. On Android that is a visibly
   * smeared double-bold. */
  return (
    <RNText
      ref={ref}
      style={[style, { fontFamily, fontWeight: undefined }]}
      {...props}
    />
  );
});
