import { BlurView } from "expo-blur";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { ChatsCircleIcon } from "phosphor-react-native/src/icons/ChatsCircle";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";

import { AvatarFace } from "../avatar/AvatarFace";

/**
 * Instagram's proportions, near enough to compare side by side.
 *
 * A floating pill rather than a bar welded to the bottom edge, which is the
 * whole reason the native one could not be used: `UITabBar` is 62pt inside an
 * 83pt container and neither is reachable.
 *
 * These are the numbers to argue with. Everything else in this file follows
 * from them.
 */
const BAR = {
  /** Pill height. The native bar's content box is 62; this is the visible ask. */
  height: 46,
  /** Gap from each screen edge. */
  inset: 14,
  /** Gap between the pill and the home indicator. */
  bottom: 6,
  radius: 23,
};

/** What each tab is, in the order they sit in the bar. */
export type TabKey = "(server)" | "search" | "you";

export interface TabBarProps {
  active: TabKey;
  onSelect: (key: TabKey) => void;
  /** Whose face the You tab wears. */
  name: string | null | undefined;
}

/**
 * Our own tab bar.
 *
 * Replaces `expo-router/unstable-native-tabs`, and the trade is written down in
 * GRYT-458: the native bar's height is UIKit's, so matching Instagram meant
 * leaving it. What that costs is the system's own blur and tab transitions.
 * What it buys back is everything the native bar refused —
 *
 * - **Phosphor icons.** `NativeTabs.Trigger.Icon` took SF Symbols and Material
 *   glyphs and nothing else, so the bar was the one place in the app drawing
 *   from a different icon set.
 * - **A real avatar, as an element.** The native icon took an
 *   `ImageSourcePropType` and never a React element, which is the only reason
 *   `useAvatarIcon` existed — mount an SVG offscreen, read it back through
 *   `toDataURL`, hand over a base64 PNG. All of that is gone; `AvatarFace`
 *   renders directly.
 *
 * `BlurView` rather than `@expo/ui`'s `GlassEffectContainer`, which is the real
 * Liquid Glass and cannot be used here: it hosts SwiftUI children, and these
 * are React Native pressables. A `UIVisualEffectView` is the closest thing that
 * can have our own buttons inside it.
 */
export function TabBar({ active, onSelect, name }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: BAR.inset,
        right: BAR.inset,
        bottom: insets.bottom + BAR.bottom,
      }}
    >
      <BlurView
        intensity={60}
        tint="systemChromeMaterialDark"
        style={{
          height: BAR.height,
          borderRadius: BAR.radius,
          overflow: "hidden",
          flexDirection: "row",
          alignItems: "center",
          /* A hairline, because a blur over a dark app has no edge of its own
             and the pill dissolves into the background without one. */
          borderWidth: 1,
          borderColor: theme.alpha.neutral[3],
        }}
      >
        <Tab
          active={active === "(server)"}
          onPress={() => onSelect("(server)")}
          label="Server"
        >
          <ChatsCircleIcon
            size={26}
            weight={active === "(server)" ? "fill" : "regular"}
            color={active === "(server)" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        <Tab active={active === "search"} onPress={() => onSelect("search")} label="Search">
          <MagnifyingGlassIcon
            size={26}
            weight={active === "search" ? "bold" : "regular"}
            color={active === "search" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        <Tab active={active === "you"} onPress={() => onSelect("you")} label="You">
          {/* 26 to sit at the same optical weight as the glyphs beside it — the
              same reasoning as when this was a native icon, and the same number.
              A disc, so it reads as a portrait rather than a blob. */}
          <AvatarFace name={name} size={26} disc />
        </Tab>
      </BlurView>
    </View>
  );
}

/**
 * One slot in the bar.
 *
 * Equal flex rather than measured widths: three tabs, and a bar whose items
 * jump around as the selected one changes is worse than one that never moves.
 */
function Tab({
  active,
  onPress,
  label,
  children,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      /* No label is a visual decision; VoiceOver still has to tell three round
         buttons apart. */
      style={{
        flex: 1,
        alignSelf: "stretch",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </Pressable>
  );
}
