import { useEffect, useRef, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useReducedMotion } from "@gryt/ui-native";

/** Fades the new layout in when the window changes size: folding, unfolding or turning the phone. */
export function WindowFade({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const last = useRef({ width, height });

  useEffect(() => {
    if (last.current.width === width && last.current.height === height) return;
    last.current = { width, height };
    if (!reduceMotion) opacity.value = withSequence(withTiming(0.2, { duration: 0 }), withTiming(1, { duration: 280 }));
  }, [width, height, reduceMotion, opacity]);

  const style = useAnimatedStyle(() => ({ flex: 1, opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
