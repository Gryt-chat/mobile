import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Screen } from "react-native-screens";
import { TabSlot } from "expo-router/ui";

/** Matches the Drawer's curve, so the app has one way of moving. */
const TRAVEL = { duration: 260, easing: Easing.bezier(0.32, 0.72, 0, 1) };

/**
 * How far a flick carries the row past where the finger left it, in seconds of
 * its own velocity.
 *
 * This is the whole of "a flick should count". There is no separate threshold:
 * the row lands on whichever tab is nearest once the throw is added on, so a
 * short fast swipe and a long slow drag both do the obvious thing.
 */
const FLICK = 0.2;

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
  progress,
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
   * Where the row is, in pages, written continuously — and **the row's own
   * position**, not a copy of it.
   *
   * This used to be a third shared value derived from two others through a
   * `useAnimatedReaction`. There is one number: the page the row is showing, a
   * fraction of the way between two of them while a finger is down. The bar's
   * capsule reads it, which is what lets the capsule track a drag rather than
   * jump when the route changes on release.
   *
   * Owned by the layout rather than by either of them, because two things need
   * it and neither is the other's parent.
   */
  progress: SharedValue<number>;
}) {
  const { width } = useWindowDimensions();
  const count = order.length;

  /** Where the row was when the finger went down. */
  const grabbed = useSharedValue(0);

  /* The route is the source of truth: when it changes — by a tap, a deep link,
   * or the settle below — the row travels to match. */
  useEffect(() => {
    progress.value = withTiming(index, TRAVEL);
  }, [index, progress]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      grabbed.value = progress.value;
    })
    .onUpdate((e) => {
      const wanted = grabbed.value - e.translationX / width;
      const inRange = Math.min(Math.max(wanted, 0), count - 1);
      /* Resist at the ends rather than stopping dead. A row that will not move
       * reads as a broken gesture; one that moves a little reads as an edge. */
      progress.value = inRange + (wanted - inRange) * RESIST;
    })
    .onEnd((e) => {
      /**
       * The nearest page to where the row actually is, plus the throw.
       *
       * Not "one page along if you dragged far enough", which is what this used
       * to be: a drag across two pages settled one page along, back under the
       * finger it had just left behind.
       */
      const thrown = progress.value - (e.velocityX / width) * FLICK;
      const settled = Math.min(Math.max(Math.round(thrown), 0), count - 1);

      progress.value = withTiming(settled, TRAVEL);
      if (settled !== index) runOnJS(onSettle)(settled);
    });

  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * width }],
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
