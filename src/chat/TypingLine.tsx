import { useEffect, useRef, useState } from "react";
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
 * "Sivert is typing…", above the composer, growing from no height over 160ms as desktop's
 * does, so the chat eases up rather than jumping a line. No faces: the message has an avatar.
 */
export function TypingLine({ typers }: { typers: Typer[] }) {
  const theme = useTheme();
  const label = typingLabel(typers.map((t) => t.nickname));
  // Kept while the line closes, so the words don't vanish before the space does.
  const lastLabel = useRef(label);
  if (label) lastLabel.current = label;
  const [lineHeight, setLineHeight] = useState(0);
  const open = useSharedValue(label ? 1 : 0);
  useEffect(() => {
    open.value = withTiming(label ? 1 : 0, { duration: 160 });
  }, [label, open]);
  const grow = useAnimatedStyle(() => ({ height: lineHeight * open.value, opacity: open.value }));

  return (
    <Animated.View style={[{ overflow: "hidden" }, grow]} accessibilityElementsHidden={!label}>
    <View
      onLayout={(e) => setLineHeight(e.nativeEvent.layout.height)}
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
      accessibilityLabel={label ?? undefined}
    >
      <Dots />
      <Text
        numberOfLines={1}
        style={{ color: theme.color.muted, fontSize: 12.5, flex: 1, minWidth: 0 }}
      >
        {lastLabel.current}
      </Text>
    </View>
    </Animated.View>
  );
}

/**
 * Three dots, breathing. On the UI thread through Reanimated, because this runs the
 * whole time somebody is typing and the JS thread is busy with what caused it.
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
