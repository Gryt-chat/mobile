import { useEffect, type ReactNode } from "react";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
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
   * pill in it runs 62px→857px across and 1782px→1878px down. Which gives:
   */
  /** 96px tall. The native bar's content box is 62pt inside an 83pt container. */
  height: 42,
  /** 62px in from each edge. */
  inset: 27,
  /** Sits well clear of the home indicator — 53pt off the bottom, of which the
   *  safe area is 34. */
  bottom: 19,
  /** A pill, so half the height. */
  radius: 21,
  /** Icons measure ~59px in the reference. */
  icon: 26,
  /**
   * Clear air above the bar, for anything that reserves room below itself.
   *
   * Without it a composer's own bottom edge lands exactly on the bar's top
   * edge, which reads as one welded control rather than as a pill floating
   * over a page.
   */
  gap: 12,
};

/**
 * The selected capsule, inset inside its slot.
 *
 * Horizontal is a fraction rather than a fixed number because the slot width is
 * the screen's, and a capsule 6pt in from each side of a 116pt slot is a very
 * different shape from one in a 90pt slot on a smaller phone.
 */
const PILL = { inset: 3, slotFraction: 0.62 };

/** How the capsule travels when a tab is tapped. Matches the pager's curve. */
const TRAVEL = { duration: 260, easing: Easing.bezier(0.32, 0.72, 0, 1) };

/**
 * How far the capsule stretches while it is travelling.
 *
 * The thing that makes iOS 26's bar read as liquid rather than as a sliding
 * rectangle: the capsule is longest halfway between two tabs and back to its
 * own width once it lands. Driven off the distance to the nearest slot, so it
 * applies to a drag exactly as it does to a tap — the further you pull the row,
 * the further the capsule leans after it.
 */
const STRETCH = 0.34;

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
export const TAB_BAR_SPACE = BAR.height + BAR.bottom + BAR.gap;

/** What each tab is, in the order they sit in the bar. */
export type TabKey = "(server)" | "search" | "you";

const SLOTS: TabKey[] = ["(server)", "search", "you"];

export interface TabBarProps {
  active: TabKey;
  onSelect: (key: TabKey) => void;
  /** Whose face the You tab wears. */
  name: string | null | undefined;
  /**
   * Where the pager is, in pages, as a fraction — 0.4 means the row is 40% of
   * the way from the server page to search.
   *
   * The bar follows this rather than `active`, which is what lets the capsule
   * track a finger mid-drag instead of jumping once the route finally changes.
   */
  progress: SharedValue<number>;
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
 * **The glass is real now.** GRYT-458 settled for `expo-blur` because
 * `@expo/ui`'s `GlassEffectContainer` hosts SwiftUI children and these are
 * React Native pressables. That is still true of `@expo/ui`, and it turned out
 * not to be true of Liquid Glass generally: `expo-glass-effect`'s `GlassView`
 * is a `UIVisualEffectView` with a `UIGlassEffect` on it, which is an ordinary
 * `UIView` and takes ordinary React Native children.
 *
 * `BlurView` survives as the fallback, because `GlassView` renders as a plain
 * transparent `View` everywhere Liquid Glass does not exist — Android, and iOS
 * before 26. A bar you cannot see is worse than a blurred one.
 */
export function TabBar({ active, onSelect, name, progress }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  /**
   * How far You has taken the capsule off the pager, 0 to 1.
   *
   * You is a sheet rather than a page, so `progress` knows nothing about it and
   * the capsule has to be told. Interpolating between the pager's position and
   * slot 2 — rather than setting the slot outright — means opening You from
   * halfway through a drag still travels from where the capsule actually is.
   */
  const you = useSharedValue(active === "you" ? 1 : 0);
  useEffect(() => {
    you.value = withTiming(active === "you" ? 1 : 0, TRAVEL);
  }, [active, you]);

  const slot = useDerivedValue(
    () => progress.value + (SLOTS.length - 1 - progress.value) * you.value,
  );

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
      <Pill>
        <Capsule slot={slot} width={window.width - BAR.inset * 2} />

        <Tab
          onPress={() => onSelect("(server)")}
          selected={active === "(server)"}
          label="Server"
        >
          <ChatsCircleIcon
            size={BAR.icon}
            weight={active === "(server)" ? "fill" : "regular"}
            color={active === "(server)" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        <Tab onPress={() => onSelect("search")} selected={active === "search"} label="Search">
          <MagnifyingGlassIcon
            size={BAR.icon}
            weight={active === "search" ? "bold" : "regular"}
            color={active === "search" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        <Tab onPress={() => onSelect("you")} selected={active === "you"} label="You">
          {/* A disc, so it reads as a portrait rather than a blob, and the same
              size as the glyphs beside it. */}
          <AvatarFace name={name} size={BAR.icon} disc />
        </Tab>
      </Pill>
    </View>
  );
}

/**
 * The bar itself: Liquid Glass where there is any, a blur where there is not.
 *
 * `isLiquidGlassAvailable` rather than a version check. It is false on a phone
 * whose owner turned the effect off in accessibility settings as well as on one
 * too old to have it, and both want the fallback.
 */
function Pill({ children }: { children: ReactNode }) {
  const theme = useTheme();

  const shape = {
    height: BAR.height,
    borderRadius: BAR.radius,
    overflow: "hidden" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  };

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        /* The bar reacts to a touch the way the system's own does — the glass
           brightens and lenses under the finger. It is the one thing `GlassView`
           does that no amount of drawing on top of a blur reproduces. */
        isInteractive
        /* The app is dark whatever the phone is set to, and glass left on `auto`
           reads the phone. A light bar under a dark app is worse than no glass. */
        colorScheme="dark"
        style={shape}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={60}
      tint="systemChromeMaterialDark"
      style={{
        ...shape,
        /* A hairline, because a blur over a dark app has no edge of its own and
           the pill dissolves into the background without one. Glass has its own
           edge and does not want this. */
        borderWidth: 1,
        borderColor: theme.alpha.neutral[3],
      }}
    >
      {children}
    </BlurView>
  );
}

/**
 * The capsule behind the selected tab.
 *
 * One capsule that moves, rather than one per slot that appears and disappears
 * — which is what this was, and is the whole of GRYT-467.
 *
 * Positioned with `translateX` off the bar's own width rather than with a
 * percentage `left`. Both animate, but a transform is composited and a
 * percentage is a layout property: moving the capsule that way relayouts the
 * bar on every frame of every drag.
 *
 * The width is arithmetic, not a measurement — the bar is the window minus its
 * two insets, and the slots are equal thirds of it. There is nothing to wait
 * for, so the capsule is in the right place on the very first frame instead of
 * flashing at zero until an `onLayout` comes back.
 *
 * A real translucent white rather than `theme.alpha.neutral`, which is
 * pre-composited against the page and would land on the glass as an opaque grey
 * lozenge — a hole in the bar rather than a highlight on it.
 */
function Capsule({ slot, width }: { slot: SharedValue<number>; width: number }) {
  const slotWidth = width / SLOTS.length;
  const capsuleWidth = slotWidth * PILL.slotFraction;
  /* Centred in its slot: the margin is whatever the capsule does not use. */
  const margin = (slotWidth - capsuleWidth) / 2;

  const style = useAnimatedStyle(() => {
    /* Distance to the nearest slot, 0 at rest and 0.5 exactly between two. */
    const away = Math.abs(slot.value - Math.round(slot.value));

    return {
      transform: [
        { translateX: margin + slot.value * slotWidth },
        { scaleX: 1 + away * 2 * STRETCH },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          top: PILL.inset,
          bottom: PILL.inset,
          width: capsuleWidth,
          borderRadius: BAR.radius - PILL.inset,
          backgroundColor: "rgba(255, 255, 255, 0.16)",
        },
        style,
      ]}
    />
  );
}

/**
 * One slot in the bar.
 *
 * Equal flex rather than measured widths: three tabs, and a bar whose items
 * jump around as the selected one changes is worse than one that never moves.
 * The capsule above depends on it too — it positions itself in thirds.
 */
function Tab({
  onPress,
  selected,
  label,
  children,
}: {
  onPress: () => void;
  selected: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
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
