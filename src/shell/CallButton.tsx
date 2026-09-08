import { Pressable, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { PhoneIcon } from "phosphor-react-native/src/icons/Phone";

import { BAR, useBarBottom } from "./TabBar";

/** 56pt. Larger than a tab's 52 capsule, because it is not one of them. */
const SIZE = 56;

/**
 * The way back into a call you have navigated away from. **It exists only while a call
 * does** — not while the call *screen* is open, which would make it a close button.
 * Floating above the bar's right end: inside, it was a fourth tab with extra steps.
 */
export function CallButton({ inCall, onPress }: { inCall: boolean; onPress: () => void }) {
  const theme = useTheme();
  const barBottom = useBarBottom();

  /* Unmounted rather than hidden: it has no resting state to animate out to, and a
     pressable with `opacity: 0` still takes touches from the page underneath. */
  if (!inCall) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        right: BAR.inset,
        /* Clear of the bar by the same gap the bar reserves above itself, so
           the two read as a pair floating over the page rather than a stack. */
        bottom: barBottom + BAR.height + BAR.gap,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Show the call"
        hitSlop={8}
        style={({ pressed }) => ({
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.success,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <PhoneIcon size={24} weight="fill" color={theme.color.onAccent} />
      </Pressable>
    </View>
  );
}
