import type { ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "@gryt/ui-native";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";

/** How far a message has to be pulled before letting go replies to it. */
export const REPLY_AT = 64;
/** Past this it stops following the finger, so the arrow never slides off with it. */
const MAX_PULL = 96;

/**
 * Drag a message to the right to reply to it (GRYT-1705), the quick version of hold, then Reply.
 * Only a sideways drag starts it; anything more vertical is left to the list's scrolling.
 */
export function SwipeToReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const dx = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(14)
    .failOffsetX(-14)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      dx.value = Math.max(0, Math.min(MAX_PULL, e.translationX));
    })
    .onEnd(() => {
      if (dx.value >= REPLY_AT) runOnJS(onReply)();
      dx.value = withSpring(0, { damping: 18, stiffness: 220 });
    })
    .onFinalize(() => {
      if (dx.value !== 0) dx.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dx.value, [12, REPLY_AT], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(dx.value, [REPLY_AT - 8, REPLY_AT], [0.8, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <GestureDetector gesture={pan}>
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
