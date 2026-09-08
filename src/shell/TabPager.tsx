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

import { FLICK, PAGE_SLOT, nearestPage, pullsOpenServers } from "./tabs";
import { TRAVEL } from "./tabMotion";

/** How far past the first and last page a drag is allowed to pull. */
const RESIST = 0.25;

/**
 * The pageable tabs, side by side, dragged between. `TabSlot` swaps one focused
 * screen and cannot show a drag, so `renderFn` lays every screen out absolutely.
 * **The route does not change while you drag** — once, on release.
 */
export function TabPager({
  index,
  order,
  onSettle,
  onPullPastStart,
  slot,
  enabled = true,
}: {
  /** Which page is current, from the route. */
  index: number;
  /**
   * Route names, left to right, as the bar shows them. **Not the order `TabSlot`
   * hands its descriptors over in** — laying out by descriptor index put You in the
   * middle and landed a tap on Search while the capsule correctly said You.
   */
  order: string[];
  /** Called once, after a release that lands on a different page. */
  onSettle: (next: number) => void;
  /**
   * Called when a right-drag pulls past the first page. There is nothing to the left
   * of the channel list, so that travel opens the servers.
   */
  onPullPastStart?: () => void;
  /**
   * Which slot the bar's capsule is at, 0 to 3, continuously. **Slots, not pages**,
   * and the pager converts — the bar owns the other half of this gesture.
   */
  slot: SharedValue<number>;
  /**
   * Whether a horizontal drag is the pager's to claim. False while a channel is open,
   * or the edge swipe the native stack uses to go back is taken by the pan.
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

  /**
   * The page the row is showing, from the slot the capsule is at. Identity since
   * GRYT-948, kept because `PAGE_SLOT` is where a non-page slot would be declared.
   */
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
       * The nearest page to where the row actually is, plus the throw. Not "one page
       * along if you dragged far enough", which settled back under the finger.
       */
      const thrown = page(slot.value) - (e.velocityX / width) * FLICK;
      const settled = nearestPage(interpolate(thrown, [0, 1, 2], PAGE_SLOT));

      slot.value = withTiming(settled.slot, TRAVEL);
      if (settled.page !== index) runOnJS(onSettle)(settled.page);
      else if (onPullPastStart && pullsOpenServers({ index, settledPage: settled.page, thrown })) {
        runOnJS(onPullPastStart)();
      }
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
