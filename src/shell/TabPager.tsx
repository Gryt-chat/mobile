import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Screen } from "react-native-screens";
import { TabSlot } from "expo-router/ui";

import { FLICK, PAGE_SLOT, nearestPage } from "./tabs";
import { TRAVEL } from "./tabMotion";

/** How far past the first and last page a drag is allowed to pull. */
const RESIST = 0.25;

/**
 * The pageable tabs, side by side, dragged between.
 *
 * `TabSlot` renders one focused screen and swaps it. That cannot show a drag —
 * there is nothing beside the current page to pull into view — so `renderFn`
 * lays every screen out absolutely at `index * width` and this translates the
 * whole row.
 *
 * **The route does not change while you drag.** It changes once, on release,
 * after the row has been asked to settle on the nearest page. Anything else
 * means the header and the bar flicker through states you are only passing
 * over — and a drag you abandon would still have navigated.
 *
 * `activeOffsetX` and `failOffsetY` are what let a vertical scroll inside a
 * page still work: the pan only claims the touch once it is clearly
 * horizontal, and gives up entirely once it is clearly vertical.
 */
export function TabPager({
  index,
  order,
  onSettle,
  slot,
  enabled = true,
}: {
  /** Which page is current, from the route. */
  index: number;
  /**
   * Route names, left to right, as the bar shows them.
   *
   * **Not the order `TabSlot` hands its descriptors over in.** That is the
   * navigator's own, and with three routes it comes out `(server)`, `you`,
   * `search` — nothing to do with the `TabList` the triggers are declared in.
   * Laying the row out by descriptor index therefore put You in the middle and
   * Search on the right, so tapping You slid the row to the third page and
   * landed on Search, while the bar's capsule correctly said You. The route was
   * right the whole time; only the geometry was wrong.
   *
   * So each screen is placed at *this* list's index of its route name, and the
   * bar and the row cannot disagree about where a page is.
   */
  order: string[];
  /** Called once, after a release that lands on a different page. */
  onSettle: (next: number) => void;
  /**
   * Which slot the bar's capsule is at, 0 to 3, continuously.
   *
   * **Slots, not pages**, and the pager converts. The bar owns the other half
   * of this gesture — a finger dragged across the bar moves the capsule over
   * the phone as well as the pages, and a page number has no way to say that.
   *
   * Owned by the layout rather than by either of them, because two things need
   * it and neither is the other's parent.
   */
  slot: SharedValue<number>;
  /**
   * Whether a horizontal drag is the pager's to claim.
   *
   * False while a channel is open. The pan below takes any horizontal drag of
   * twelve points anywhere on the page, which includes the one starting at the
   * left edge that the native stack uses to go back — so the only way out of a
   * channel was the button in the corner. While there is something to go back
   * to, sideways means back.
   */
  enabled?: boolean;
}) {
  const { width } = useWindowDimensions();
  const count = order.length;

  /** Where the row was when the finger went down, in pages. */
  const grabbed = useSharedValue(0);

  /* The route is the source of truth: when it changes — by a tap, a deep link,
   * a drag on the bar, or the settle below — the row travels to match. */
  useEffect(() => {
    slot.value = withTiming(PAGE_SLOT[index], TRAVEL);
  }, [index, slot]);

  /** The page the row is showing, from the slot the capsule is at. */
  const page = (at: number) => {
    "worklet";
    return interpolate(at, PAGE_SLOT, [0, 1, 2]);
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      grabbed.value = page(slot.value);
    })
    .onUpdate((e) => {
      const wanted = grabbed.value - e.translationX / width;
      const inRange = Math.min(Math.max(wanted, 0), count - 1);
      /* Resist at the ends rather than stopping dead. A row that will not move
       * reads as a broken gesture; one that moves a little reads as an edge. */
      const at = inRange + (wanted - inRange) * RESIST;
      slot.value = interpolate(at, [0, 1, 2], PAGE_SLOT);
    })
    .onEnd((e) => {
      /**
       * The nearest page to where the row actually is, plus the throw.
       *
       * Not "one page along if you dragged far enough", which is what this used
       * to be: a drag across two pages settled one page along, back under the
       * finger it had just left behind.
       */
      const thrown = page(slot.value) - (e.velocityX / width) * FLICK;
      const settled = nearestPage(interpolate(thrown, [0, 1, 2], PAGE_SLOT));

      slot.value = withTiming(settled.slot, TRAVEL);
      if (settled.page !== index) runOnJS(onSettle)(settled.page);
    });

  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: -page(slot.value) * width }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, row]}>
        <TabSlot
          /* Every page stays mounted. Detaching them is the default and is the
             whole reason a drag has nothing to reveal. */
          detachInactiveScreens={false}
          style={{ width: width * count }}
          renderFn={(descriptor, { isFocused }) => (
            <Screen
              key={descriptor.route.key}
              enabled={false}
              activityState={isFocused ? 2 : 1}
              style={{
                position: "absolute",
                left: order.indexOf(descriptor.route.name) * width,
                top: 0,
                bottom: 0,
                width,
              }}
            >
              <View style={{ flex: 1 }}>{descriptor.render()}</View>
            </Screen>
          )}
        />
      </Animated.View>
    </GestureDetector>
  );
}
