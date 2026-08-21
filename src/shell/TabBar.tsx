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
  /**
   * Measured off the reference screenshot rather than picked.
   *
   * That image is 919px wide for a 402pt device, so 2.286px per point, and the
   * pill in it runs 62px→857px across and 1789px→1877px down. Which gives:
   */
  /** 88px tall. The native bar's content box is 62pt inside an 83pt container. */
  height: 38,
  /** 62px in from each edge. */
  inset: 27,
  /** Sits well clear of the home indicator — 53pt off the bottom, of which the
   *  safe area is 34. */
  bottom: 19,
  /** A pill, so half the height. */
  radius: 19,
  /** Icons measure ~52px in the reference. */
  icon: 24,
};

/**
 * How much room the bar takes out of the bottom of every screen.
 *
 * The bar floats over the content rather than sitting under it, which is the
 * whole point of the shape — and the cost is that nothing below it is visible
 * unless the screen reserves the space itself. A composer pinned to the bottom
 * disappeared behind it the moment this bar replaced the native one, because
 * the native bar was laid out *above* the content and this one is not.
 *
 * Does not include the safe area: screens add that themselves, and adding it
 * here would double it wherever a screen already had it.
 */
export const TAB_BAR_SPACE = BAR.height + BAR.bottom;

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
          alpha={theme.alpha.neutral[3]}
          label="Server"
        >
          <ChatsCircleIcon
            size={BAR.icon}
            weight={active === "(server)" ? "fill" : "regular"}
            color={active === "(server)" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        <Tab active={active === "search"} onPress={() => onSelect("search")}
          alpha={theme.alpha.neutral[3]} label="Search">
          <MagnifyingGlassIcon
            size={BAR.icon}
            weight={active === "search" ? "bold" : "regular"}
            color={active === "search" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        <Tab active={active === "you"} onPress={() => onSelect("you")}
          alpha={theme.alpha.neutral[3]} label="You">
          {/* A disc, so it reads as a portrait rather than a blob, and the same
              size as the glyphs beside it. */}
          <AvatarFace name={name} size={BAR.icon} disc />
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
  alpha,
  children,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  /** Fill for the selected capsule, passed in so the theme is read once. */
  alpha: string;
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
      {/* The capsule behind the selected tab, which the reference has and which
          is the only thing marking the current tab once the labels are gone.
          Inset so it reads as sitting *in* the bar rather than as a second bar. */}
      {active ? (
        <View
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 6,
            right: 6,
            borderRadius: BAR.radius,
            backgroundColor: alpha,
          }}
        />
      ) : null}
      {children}
    </Pressable>
  );
}
