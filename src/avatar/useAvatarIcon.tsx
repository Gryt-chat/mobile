import { useCallback, useMemo, useRef, useState } from "react";
import { PixelRatio, View } from "react-native";
import Svg, { parse, SvgAst } from "react-native-svg";
import type { ImageSourcePropType } from "react-native";

import { avatarSeed, generatedAvatarSvg } from "./generatedAvatar";

/**
 * Someone's face as something the native tab bar will accept.
 *
 * The bar does not take a React element. `NativeTabs.Trigger.Icon` accepts
 * `sf` / `xcasset` / `drawable` / `md`, or `src`, and `src` is an
 * `ImageSourcePropType` — a URI, not a component. A generated avatar is SVG,
 * and nothing in React Native's image pipeline decodes SVG. So the face has to
 * be rasterised first, on device, at runtime.
 *
 * That is what this does: mount the SVG offscreen, ask `react-native-svg` for
 * a PNG through `toDataURL`, and hand the result to the bar.
 *
 * **The caller has to render `offscreen`.** `toDataURL` reads back a view that
 * is actually in the tree — an unmounted `Svg` has nothing to snapshot. It is a
 * zero-opacity, zero-size, non-interactive `View`, so it costs a mount and
 * nothing else.
 *
 * **`source` is null until the readback lands**, which is a frame or two after
 * mount, and stays null forever if it fails. Callers fall back to an SF Symbol
 * rather than rendering nothing: an `Icon` given a source it cannot use draws
 * *no icon at all* — not a placeholder, not a broken image — so an unguarded
 * failure here is an empty slot in the tab bar with nothing in the log.
 *
 * **`size` is in points and `scale` is not optional.** A data URI carries no
 * `@2x`/`@3x` in its name, so React Native assumes 1x and lays the image out at
 * its pixel size. Rasterising at 84px and handing it over bare put an 84pt face
 * in a 49pt tab bar — it covered the Search tab and hung off both edges.
 * Rasterising at `size * PixelRatio` and declaring that scale is what makes it
 * land at `size` points while still being sharp on a 3x screen.
 */
export function useAvatarIcon(name: string | null | undefined, size = 28) {
  const ref = useRef<Svg>(null);
  const [source, setSource] = useState<ImageSourcePropType | null>(null);

  const seed = avatarSeed(name);
  const ast = useMemo(() => (seed ? parse(generatedAvatarSvg(seed)) : null), [seed]);

  const scale = PixelRatio.get();
  const pixels = Math.round(size * scale);

  /* Keyed on the seed so a rename re-rasterises rather than keeping the old
   * face, and so the readback is not re-run on every unrelated render. */
  const rasterised = useRef<string | null>(null);

  const capture = useCallback(() => {
    if (!seed || rasterised.current === seed) return;
    const node = ref.current;
    if (!node) return;

    rasterised.current = seed;
    try {
      node.toDataURL(
        (base64) => {
          /* toDataURL hands back bare base64 with no data: prefix. */
          if (base64) {
            setSource({
              uri: `data:image/png;base64,${base64}`,
              width: pixels,
              height: pixels,
              scale,
            });
          }
        },
        { width: pixels, height: pixels },
      );
    } catch {
      /* Leave `source` null. The caller's fallback icon is the right outcome,
       * and there is nothing here worth crashing a tab bar over. */
      rasterised.current = null;
    }
  }, [seed, pixels, scale]);

  const offscreen =
    ast === null ? null : (
      <View
        pointerEvents="none"
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* `SvgAst` with an explicit `override` rather than `SvgXml`, because the
            ref has to reach the root `Svg` and that is the documented way in:
            `SvgAst` spreads `override` onto it. Passing `ref` to `SvgXml` does
            happen to work under React 19, where refs are ordinary props, but
            relying on that is a trap for whoever upgrades next. */}
        <SvgAst ast={ast} override={{ ref, width: pixels, height: pixels, onLayout: capture }} />
      </View>
    );

  return { source, offscreen };
}
