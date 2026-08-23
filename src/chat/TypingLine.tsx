import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Text, useTheme } from "@gryt/ui-native";

import { typingLabel, type Typer } from "./typing";

/**
 * "Sivert is typing…", above the composer.
 *
 * **It occupies no height when nobody is typing.** The alternative — a reserved
 * row that is usually empty — costs a line of the message list permanently to
 * avoid the list shifting occasionally, and on a phone that line is worth more
 * than the shift. The composer is pinned to the bottom either way, so what
 * moves is the boundary between the list and the composer rather than the
 * composer itself.
 *
 * No faces. `Faces` is the right component for a group and the wrong one here:
 * this row sits directly under the last message, which already has an avatar
 * in the same column, and a second stack of the same faces two lines below
 * reads as a duplicate message rather than as a status.
 */
export function TypingLine({ typers }: { typers: Typer[] }) {
  const theme = useTheme();
  const label = typingLabel(typers.map((t) => t.nickname));

  if (!label) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        paddingHorizontal: theme.space(4),
        paddingBottom: theme.space(1),
      }}
      /* One live region rather than a label per person: a screen reader should
         say the sentence when it changes, not announce three dots. */
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Dots />
      <Text
        numberOfLines={1}
        style={{ color: theme.color.muted, fontSize: 12.5, flex: 1, minWidth: 0 }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Three dots, breathing.
 *
 * On the UI thread through Reanimated rather than `Animated` from React
 * Native, because this runs the whole time somebody is typing and the JS
 * thread is busy with the thing that caused it — the socket traffic and the
 * list.
 */
function Dots() {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 160} colour={theme.color.muted} />
      ))}
    </View>
  );
}

function Dot({ delay, colour }: { delay: number; colour: string }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: delay }),
        withTiming(1, { duration: 380 }),
        withTiming(0.3, { duration: 380 }),
        // Holds the cycle at one length whatever the delay is, so the three
        // stay in step with each other rather than drifting apart.
        withTiming(0.3, { duration: 480 - delay }),
      ),
      -1,
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: colour }, style]}
    />
  );
}
