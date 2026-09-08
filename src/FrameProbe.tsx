/* A continuously running animation, plus the frame rate it is achieving. It proves the
 * Reanimated worklet path is wired — a missing babel plugin falls back to the JS thread
 * silently — and it answers "is this 120?" on real hardware. */
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import { Text, useTheme } from "@gryt/ui-native";

export function FrameProbe() {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const [fps, setFps] = useState<number | null>(null);

  // Runs on the UI thread. A busy JS thread does not stop it, which is the
  // whole point of the worklet path.
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [progress]);

  const bar = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 220 }]
  }));

  // timeSincePreviousFrame is null on the first callback, and a single frame
  // is far too noisy to show, so this averages over a rolling window.
  const frames = useSharedValue(0);
  const elapsed = useSharedValue(0);

  useFrameCallback((frame) => {
    "worklet";
    if (frame.timeSincePreviousFrame == null) return;

    frames.value += 1;
    elapsed.value += frame.timeSincePreviousFrame;

    if (elapsed.value >= 500) {
      const measured = (frames.value * 1000) / elapsed.value;
      frames.value = 0;
      elapsed.value = 0;
      // runOnJS is required, not implicit: calling setFps directly throws, which is
      // itself proof the callback is on the UI thread. Rounded first, so React
      // re-renders only when the reading changes.
      runOnJS(setFps)(Math.round(measured));
    }
  }, true);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.color.muted }]}>
          UI-thread animation
        </Text>
        <Text style={[styles.fps, { color: theme.color.text }]}>
          {fps === null ? "measuring…" : `${fps} fps`}
        </Text>
      </View>
      <View
        style={[styles.track, { backgroundColor: theme.scales.neutral[3] }]}
      >
        <Animated.View
          style={[styles.dot, { backgroundColor: theme.color.accent }, bar]}
        />
      </View>
      <Text style={[styles.note, { color: theme.color.muted }]}>
        A simulator reports ~60 whatever the plist says. This number only means
        something on real hardware.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 12 },
  fps: { fontSize: 13, fontVariant: ["tabular-nums"] },
  track: { height: 28, borderRadius: 14, justifyContent: "center", padding: 4 },
  dot: { width: 20, height: 20, borderRadius: 10 },
  note: { fontSize: 11, lineHeight: 15 }
});
