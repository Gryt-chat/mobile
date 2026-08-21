import type { ReactNode } from "react";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "@gryt/ui-native";
import { HouseIcon } from "phosphor-react-native/src/icons/House";
import { PhoneIcon } from "phosphor-react-native/src/icons/Phone";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";

import { AvatarFace } from "../avatar/AvatarFace";

/**
 * The bar, measured off the Figma file rather than off a screenshot.
 *
 * That frame is 603×1311, which is a 402×874 iPhone at exactly 1.5×, so every
 * number below is the design's divided by 1.5. It replaces a set measured off
 * an Instagram screenshot, and the two disagree about almost everything: this
 * bar is half again as tall, sits lower, and is inset less.
 *
 * A floating pill rather than a bar welded to the bottom edge, which is the
 * whole reason the native one could not be used: `UITabBar` is 62pt inside an
 * 83pt container and neither is reachable.
 *
 * These are the numbers to argue with. Everything else in this file follows
 * from them.
 */
const BAR = {
  /** 90px in the design. */
  height: 60,
  /** 32px in from each edge, of 603. */
  inset: 21,
  /**
   * 32px off the bottom of the frame — **the screen's bottom, not the safe
   * area's**, which is why nothing here adds `insets.bottom`.
   *
   * That leaves the bar ending 21pt up, and the home indicator lives in the
   * bottom 8 to 13, so they clear each other by 8pt. The old number was 19pt
   * *plus* the 34pt inset, which put the bar 53pt up — half a bar's height
   * higher than the design.
   */
  bottom: 21,
  /** 45px. Half the height, so a true pill. */
  radius: 30,
  /**
   * 32px, which is Phosphor's own box at its default size — the design's glyph
   * paths are Phosphor regular dropped in unchanged, and they measure 30–32px
   * across because that is how much of the box each one fills.
   */
  icon: 21.33,
  /** The avatar is drawn larger than the glyphs, 38px to their 32. */
  avatar: 25.33,
  /** 2px of white around the avatar, and nothing around the glyphs. */
  avatarRing: 1.33,
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
 * The selected capsule: its slot, inset by the same amount on all four sides.
 *
 * **One number, not two.** The old shape had 3pt above and below and 19pt
 * either side, which is what "too much X padding" was — the capsule read as a
 * lozenge floating in a wide slot rather than as the slot lit up.
 *
 * 8px in the design, over 1.5, is 5.33. 6 is the round number next to it and
 * is what this uses. The arithmetic that makes it work is that the slots are
 * equal divisions of the **whole** bar, edge to edge — so the capsule under
 * the first tab ends up exactly `inset` from the bar's own left edge, and the
 * one under the last exactly `inset` from its right. The design has that
 * property and it is the reason the padding reads as even everywhere.
 */
const PILL = { inset: 6 };

/**
 * The phone when there is no call.
 *
 * A quarter-opacity white rather than `theme.color.muted`, which is a solid
 * grey mixed for text on the page background and lands on glass as a smudge.
 */
const IDLE_PHONE = "rgba(255, 255, 255, 0.25)";

/**
 * How far the capsule stretches while it is travelling.
 *
 * The thing that makes iOS 26's bar read as liquid rather than as a sliding
 * rectangle: the capsule is longest halfway between two tabs and back to its
 * own width once it lands. Driven off the distance to the nearest slot, so it
 * applies to a drag exactly as it does to a tap — the further you pull the row,
 * the further the capsule leans after it.
 */
const STRETCH = 0.28;

/**
 * How much room the bar takes out of the bottom of every screen.
 *
 * The bar floats over the content rather than sitting under it, which is the
 * whole point of the shape — and the cost is that nothing below it is visible
 * unless the screen reserves the space itself. A composer pinned to the bottom
 * disappeared behind it the moment this bar replaced the native one, because
 * the native bar was laid out *above* the content and this one is not.
 *
 * **This is the whole distance from the bottom of the screen**, safe area
 * included, because `BAR.bottom` is measured from there too. Screens add
 * nothing to it. They used to add `insets.bottom`, which was right while the
 * bar was positioned above the inset and is 34pt of dead space now.
 */
export const TAB_BAR_SPACE = BAR.height + BAR.bottom + BAR.gap;

/** What each *page* is. The bar has a fourth slot that is not one. */
export type TabKey = "(server)" | "search" | "you";

/**
 * Every slot in the bar, in order, including the one that is not a page.
 *
 * Four slots and three pages, which is the design: the phone is a button that
 * brings a call you are already in back onto the screen, not somewhere to go.
 * Only the slot count matters here — it is what the geometry divides by.
 */
const SLOT_COUNT = 4;

/**
 * Which slot each page's capsule sits in.
 *
 * The gap is slot 1, the phone. Dragging from the server page to search moves
 * the capsule two slots while the finger moves one page, which is right: the
 * capsule belongs under the tab you are heading for, and it glides over the
 * phone on the way rather than stopping there.
 */
const PAGE_SLOT = [0, 2, 3];

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
   * `active` is still read, for which icon is filled and what VoiceOver is
   * told — those want the settled answer, not the one halfway through a drag.
   */
  progress: SharedValue<number>;
  /** Whether there is a call to bring back. The phone is dead without one. */
  inCall: boolean;
  /** Puts the call back on screen. */
  onCall: () => void;
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
export function TabBar({ active, onSelect, name, progress, inCall, onCall }: TabBarProps) {
  const theme = useTheme();
  const window = useWindowDimensions();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: BAR.inset,
        right: BAR.inset,
        bottom: BAR.bottom,
      }}
    >
      <Pill>
        <Capsule page={progress} width={window.width - BAR.inset * 2} />

        <Tab
          onPress={() => onSelect("(server)")}
          selected={active === "(server)"}
          label="Server"
        >
          {/* A house, from the design. It was a speech bubble, which said
              "messages" where the tab means "the server you are in" — and the
              server screen is the app's home in every sense that matters. */}
          <HouseIcon
            size={BAR.icon}
            weight="regular"
            color={active === "(server)" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        {/* The one slot that is not a page.
            Green while there is a call and white at a quarter otherwise, which
            is the only state this slot has to carry: it never wears the
            capsule, because you are never *on* it. Dead when it is dim, since
            a phone that reopens nothing is worse than one that is visibly not
            for you yet. */}
        <Tab
          onPress={onCall}
          disabled={!inCall}
          selected={false}
          label={inCall ? "Show the call" : "Not in a call"}
        >
          <PhoneIcon
            size={BAR.icon}
            weight={inCall ? "fill" : "regular"}
            color={inCall ? theme.color.success : IDLE_PHONE}
          />
        </Tab>

        <Tab onPress={() => onSelect("search")} selected={active === "search"} label="Search">
          <MagnifyingGlassIcon
            size={BAR.icon}
            /* Regular in both states. The design draws every glyph at one
               weight and lets the capsule and the colour say which is on; a
               glyph that also thickens is two answers to one question. */
            weight="regular"
            color={active === "search" ? theme.color.accent : theme.color.text}
          />
        </Tab>

        <Tab onPress={() => onSelect("you")} selected={active === "you"} label="You">
          {/* A disc, so it reads as a portrait rather than a blob. Larger than
              the glyphs beside it and wearing a hairline of white, both from
              the design — a face at glyph size reads as a third icon rather
              than as a person. */}
          <View
            style={{
              width: BAR.avatar,
              height: BAR.avatar,
              borderRadius: BAR.avatar / 2,
              borderWidth: BAR.avatarRing,
              borderColor: "rgba(255, 255, 255, 0.9)",
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AvatarFace name={name} size={BAR.avatar} disc />
          </View>
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
 * One capsule that moves, rather than one per slot that appears and
 * disappears. Positioned with `translateX` off the bar's own width rather than
 * with a percentage `left`: both animate, but a transform is composited and a
 * percentage is a layout property, so moving it that way relayouts the bar on
 * every frame of every drag.
 *
 * The width is arithmetic, not a measurement — the bar is the window minus its
 * two insets, and the slots are equal thirds of it. There is nothing to wait
 * for, so the capsule is in the right place on the very first frame instead of
 * flashing at zero until an `onLayout` comes back.
 *
 * **The slots divide the whole bar, edge to edge.** That is what makes one
 * inset produce even padding: the first slot starts at the bar's left edge, so
 * a capsule inset 6pt into it sits exactly 6pt from that edge — the same 6pt
 * it has above and below. The design has this property and it is why its
 * padding reads as even rather than as a lozenge in a wide slot.
 *
 * A real translucent white rather than `theme.alpha.neutral`, which is
 * pre-composited against the page and would land on the glass as an opaque
 * grey lozenge — a hole in the bar rather than a highlight on it.
 */
function Capsule({ page, width }: { page: SharedValue<number>; width: number }) {
  const slotWidth = width / SLOT_COUNT;
  const capsuleWidth = slotWidth - PILL.inset * 2;

  const style = useAnimatedStyle(() => {
    /* Clamped because the row rubber-bands past its ends and the capsule must
     * not leave the bar with it. */
    const at = Math.min(Math.max(page.value, 0), PAGE_SLOT.length - 1);
    /* Pages to slots, so a drag lands the capsule where the tab actually is. */
    const slot = interpolate(at, [0, 1, 2], PAGE_SLOT);
    /* Distance to the nearest slot, 0 at rest and 0.5 exactly between two. */
    const away = Math.abs(slot - Math.round(slot));

    return {
      transform: [
        { translateX: PILL.inset + slot * slotWidth },
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
          /* A pill, like the bar: what is left of the height, halved. */
          borderRadius: (BAR.height - PILL.inset * 2) / 2,
          backgroundColor: "rgba(255, 255, 255, 0.14)",
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
  disabled,
  children,
}: {
  onPress: () => void;
  selected: boolean;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled: disabled ?? false }}
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
