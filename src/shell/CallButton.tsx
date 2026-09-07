import { Pressable, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { PhoneIcon } from "phosphor-react-native/src/icons/Phone";

import { BAR, useBarBottom } from "./TabBar";

/** 56pt. Larger than a tab's 52 capsule, because it is not one of them. */
const SIZE = 56;

/**
 * The way back into a call you have navigated away from.
 *
 * It was the second of four slots in the tab bar, drawn dead in an idle grey
 * whenever there was no call — so most of the time a quarter of the bar was a
 * button that did nothing, and the three pages were squeezed around it. Slots
 * and pages stopped being the same list because of it, which is why
 * `nearestPage` had to search rather than round.
 *
 * **It exists only while a call does.** Not while the call *screen* is open —
 * that would make it a close button for something already in front of you. The
 * point is the other way round: it is what you press when the call is running
 * somewhere behind whatever you are reading.
 *
 * Floating above the bar's right end rather than inside it. Inside, it would
 * be a fourth tab again with extra steps; above, the bar keeps its full width
 * and this reads as its own object, which is the whole reason it moved.
 */
export function CallButton({ inCall, onPress }: { inCall: boolean; onPress: () => void }) {
  const theme = useTheme();
  const barBottom = useBarBottom();

  /* Unmounted rather than hidden. There is nothing to animate out to — it has
     no resting state — and a pressable with `opacity: 0` still takes touches
     from the page underneath it. */
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
