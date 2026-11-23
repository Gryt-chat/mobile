import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "@gryt/ui-native";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";

/** How far a message has to be pulled before letting go replies to it. */
export const REPLY_AT = 64;
/** The avatar column. A drag starting here goes back; anywhere else on a message replies. */
export const BACK_STRIP = 56;
/** Android only: how far a drag from the strip has to go to leave the channel. iOS has its native gesture. */
const BACK_AT = 80;
/** Past this it stops following the finger, so the arrow never slides off with it. */
const MAX_PULL = 96;

/** Drag a message to the right to reply to it, the quick version of hold, then Reply. Vertical is scrolling. */
export function SwipeToReply({
  enabled,
  onReply,
  onSwipeBack,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  onSwipeBack?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const dx = useSharedValue(0);
  const settle = () => {
    "worklet";
    if (dx.value !== 0) dx.value = withSpring(0, { damping: 18, stiffness: 220 });
  };

  const reply = Gesture.Pan()
    .enabled(enabled)
    .hitSlop({ left: -BACK_STRIP })
    .activeOffsetX([-9999, 14])
    .failOffsetX([-14, 9999])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      dx.value = Math.max(0, Math.min(MAX_PULL, e.translationX));
    })
    .onEnd(() => {
      if (dx.value >= REPLY_AT) runOnJS(onReply)();
    })
    .onFinalize(settle);

  const backHere = Platform.OS === "android" && onSwipeBack !== undefined;
  const back = Gesture.Pan()
    .enabled(backHere)
    .hitSlop({ left: 0, width: BACK_STRIP })
    .activeOffsetX([-9999, 14])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      if (onSwipeBack && e.translationX >= BACK_AT) runOnJS(onSwipeBack)();
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dx.value, [12, REPLY_AT], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(dx.value, [REPLY_AT - 8, REPLY_AT], [0.8, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(reply, back)}>
      <View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", left: theme.space(3), top: 0, bottom: 0, justifyContent: "center" }, arrowStyle]}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: theme.radius.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surfaceRaised,
            }}
          >
            <ArrowBendUpLeftIcon size={18} color={theme.color.text} weight="bold" />
          </View>
        </Animated.View>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
