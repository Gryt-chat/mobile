import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
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
 * How far, or how fast, a drag has to be before it counts as a page turn.
 *
 * A quarter of the screen *or* a flick. Distance alone makes a fast swipe feel
 * ignored; velocity alone turns a twitch into a navigation.
 */
const COMMIT_FRACTION = 0.25;
const COMMIT_VELOCITY = 500;

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
 * `activeOffsetX` and `failOffsetY` are what let a vertical scroll inside a page
 * still work: the pan only claims the touch once it is clearly horizontal, and
 * gives up entirely once it is clearly vertical.
 */
export function TabPager({
  index,
  count,
  onSettle,
  progress,
}: {
  /** Which page is current, from the route. */
  index: number;
  count: number;
  /** Called once, after a release that lands on a different page. */
  onSettle: (next: number) => void;
  /**
   * Where the row is, in pages, written continuously.
   *
   * The bar's selection capsule reads it, so it follows a finger through a drag
   * rather than jumping when the route finally changes on release. Owned by the
   * layout rather than by either of them: two things need it and neither is the
   * other's parent.
   */
  progress: SharedValue<number>;
}) {
  const { width } = useWindowDimensions();

  /* Where the row rests, and how far a finger has moved it. Kept apart so a
   * drag can be released without having to know where the row was resting. */
  const base = useSharedValue(-index * width);
  const drag = useSharedValue(0);

  /* The route is the source of truth: when it changes — by a tap, a deep link,
   * or the settle below — the row travels to match. */
  useEffect(() => {
    base.value = withTiming(-index * width, TRAVEL);
  }, [index, width, base]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      /* Resist at the ends rather than stopping dead. A row that will not move
       * reads as a broken gesture; one that moves a little reads as an edge. */
      const next = index - Math.sign(e.translationX);
      const past = next < 0 || next > count - 1;
      drag.value = past ? e.translationX * 0.25 : e.translationX;
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > width * COMMIT_FRACTION;
      const fast = Math.abs(e.velocityX) > COMMIT_VELOCITY;
      const wanted = index - Math.sign(e.translationX);
      const settled =
        (far || fast) && wanted >= 0 && wanted <= count - 1 ? wanted : index;

      /* Fold the drag into the resting position in one step, so the row does not
       * jump back to centre before travelling out again. */
      base.value = base.value + drag.value;
      drag.value = 0;
      base.value = withTiming(-settled * width, TRAVEL);

      if (settled !== index) runOnJS(onSettle)(settled);
    });

  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: base.value + drag.value }],
  }));

  /* The row's position, in pages, for anything drawn outside it. Clamped
   * because the ends resist rather than stop, so a pull past the last page
   * would otherwise report a page that is not there. */
  useAnimatedReaction(
    () => -(base.value + drag.value) / width,
    (page) => {
      progress.value = Math.min(Math.max(page, 0), count - 1);
    },
    [width, count],
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, row]}>
        <TabSlot
          /* Every page stays mounted. Detaching them is the default and is the
             whole reason a drag has nothing to reveal. */
          detachInactiveScreens={false}
          style={{ width: width * count }}
          renderFn={(descriptor, { index: i, isFocused }) => (
            <Screen
              key={descriptor.route.key}
              enabled={false}
              activityState={isFocused ? 2 : 1}
              style={{ position: "absolute", left: i * width, top: 0, bottom: 0, width }}
            >
              <View style={{ flex: 1 }}>{descriptor.render()}</View>
            </Screen>
          )}
        />
      </Animated.View>
    </GestureDetector>
  );
}
