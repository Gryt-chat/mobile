import type { ReactNode } from "react";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "@gryt/ui-native";
import { HouseIcon } from "phosphor-react-native/src/icons/House";
import { PhoneIcon } from "phosphor-react-native/src/icons/Phone";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { FLICK, PAGE_SLOT, SLOT_COUNT, TABS, nearestPage, type TabKey } from "./tabs";
import { TRAVEL } from "./tabMotion";

/**
 * The bar, measured off the Figma file. **That frame is 603×1311, a 402×874
 * iPhone at exactly 1.5×, so every number below is the design's divided by
 * 1.5.**
 *
 * A floating pill rather than a bar welded to the bottom edge, which is why the
 * native one could not be used: `UITabBar` is 62pt inside an 83pt container and
 * neither is reachable.
 *
 * These are the numbers to argue with; the rest of the file follows from them.
 */
const BAR = {
  /** 90px in the design. */
  height: 60,
  /** 32px in from each edge, of 603. */
  inset: 21,
  /**
   * 32px off the bottom of the frame — **the screen's bottom, not the safe
   * area's**, on a platform where the inset is something the bar may sit
   * inside.
   *
   * That is iOS. The inset there is 34pt but the home indicator drawn in it is
   * only 8 to 13, so a bar 21pt up clears the thing you can actually see by
   * 8pt. The old number was 19pt *plus* the 34pt inset, which put the bar 53pt
   * up — half a bar's height higher than the design.
   *
   * It is a floor rather than the answer on Android: see `useBarBottom`.
   */
  bottom: 21,
  /** Clearance between the pill and an opaque system bar underneath it. */
  systemGap: 8,
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
 * **One number, not two** — 3pt above and 19pt either side reads as a lozenge
 * floating in a wide slot rather than the slot lit up.
 *
 * **The slots are equal divisions of the whole bar, edge to edge**, so the
 * capsule under the first tab is exactly `inset` from the bar's left edge and
 * the last exactly `inset` from its right. That is what makes the padding read
 * as even everywhere.
 */
const PILL = { inset: 6 };

/**
 * Ink on the glass, per appearance. **Translucent rather than `theme.color.*`
 * or `theme.alpha.*`**, both of which are solid colours mixed against the page
 * background and land on glass as a hole in the bar rather than a mark on it.
 *
 * **The alphas are not mirrored**: black at the same value reads heavier than
 * white, so every light weight is lower. The avatar's hairline keeps its own
 * value, since it separates a coloured disc from the bar.
 */
const GLASS_INK = {
  dark: {
    /** The phone when there is no call. */
    idle: "rgba(255, 255, 255, 0.25)",
    ring: "rgba(255, 255, 255, 0.9)",
    capsule: "rgba(255, 255, 255, 0.14)",
  },
  light: {
    idle: "rgba(0, 0, 0, 0.3)",
    ring: "rgba(0, 0, 0, 0.15)",
    capsule: "rgba(0, 0, 0, 0.08)",
  },
} as const;

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
 * How much room the bar takes out of the bottom of every screen. It floats over
 * the content, so nothing below it is visible unless the screen reserves the
 * space itself.
 *
 * **This is the whole distance from the bottom of the screen, safe area
 * included. Screens add nothing to it** — adding `insets.bottom` was right
 * while the bar sat above the inset and is 34pt of dead space now.
 *
 * A hook rather than a constant, because on Android the answer depends on what
 * the system is drawing at the bottom.
 */
export function useTabBarSpace(): number {
  return BAR.height + useBarBottom() + BAR.gap;
}

/**
 * How far the pill sits above the bottom of the screen. **The two platforms
 * mean different things by `insets.bottom`.**
 *
 * On iOS it is the home indicator's region, and the indicator occupies 8 to
 * 13pt of it — the design sits inside that, so the inset is not added.
 *
 * On Android it can be a three-button navigation bar: roughly 48dp, opaque, and
 * drawn over anything underneath. Reproduce with `adb shell cmd overlay enable
 * com.android.internal.systemui.navbar.threebutton`; the emulator defaults to
 * gestures, whose inset `BAR.bottom` already clears.
 */
export function useBarBottom(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "ios") return BAR.bottom;
  return Math.max(BAR.bottom, insets.bottom + BAR.systemGap);
}



export interface TabBarProps {
  /** The picture you uploaded on this server, or null for the generated face. */
  avatarUrl?: string | null;
  active: TabKey;
  onSelect: (key: TabKey) => void;
  /** Whose face the You tab wears. */
  name: string | null | undefined;
  /**
   * Which slot the capsule is at, 0 to 3, continuously.
   *
   * Shared with the pager, and written by both: a finger on a page moves it,
   * and so does a finger on this bar. `active` is still read, for which icon is
   * tinted and what VoiceOver is told — those want the settled answer, not the
   * one halfway through a drag.
   */
  slot: SharedValue<number>;
  /** Whether there is a call to bring back. The phone is dead without one. */
  inCall: boolean;
  /** Puts the call back on screen. */
  onCall: () => void;
}

/**
 * Our own tab bar, replacing `expo-router/unstable-native-tabs` (GRYT-458). The
 * native bar's height is UIKit's, and it refused Phosphor icons and a React
 * element for the avatar — the latter is why `useAvatarIcon` had to mount an
 * SVG offscreen and hand over a base64 PNG.
 *
 * The glass is `expo-glass-effect`'s `GlassView`, a `UIVisualEffectView` that
 * takes ordinary React Native children — unlike `@expo/ui`'s
 * `GlassEffectContainer`, which hosts SwiftUI ones.
 *
 * **`BlurView` survives as the fallback.** `GlassView` renders as a plain
 * transparent `View` on Android and on iOS before 26, and a bar you cannot see
 * is worse than a blurred one.
 */
export function TabBar({ active, onSelect, name, avatarUrl, slot, inCall, onCall }: TabBarProps) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const barBottom = useBarBottom();
  const width = window.width - BAR.inset * 2;
  const slotWidth = width / SLOT_COUNT;

  /** Where the capsule was when the finger went down. */
  const grabbed = useSharedValue(0);

  /**
   * Dragging the bar itself.
   *
   * The pill sits in a groove and the glass lights up under a finger, so it
   * reads as something you can grab — and until this it was not. The page's own
   * pan is the other half of the same gesture; both write `slot`, and the only
   * difference is what a point of travel means. Here it is a slot; there it is
   * a page.
   *
   * The capsule follows across **all four** slots, the phone included, which is
   * the whole reason the shared value counts slots rather than pages. It cannot
   * settle there: `nearestPage` picks the closest slot that is one, so letting
   * go over the phone falls to whichever side you were nearer.
   *
   * `activeOffsetX` so a tap still reaches the tab under it. The pan only
   * claims the touch once it is clearly sideways.
   */
  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onBegin(() => {
      grabbed.value = slot.value;
    })
    .onUpdate((e) => {
      const at = grabbed.value + e.translationX / slotWidth;
      slot.value = Math.min(Math.max(at, 0), SLOT_COUNT - 1);
    })
    .onEnd((e) => {
      const thrown = slot.value + (e.velocityX / slotWidth) * FLICK;
      const settled = nearestPage(thrown);
      slot.value = withTiming(settled.slot, TRAVEL);
      runOnJS(onSelect)(TABS[settled.page].key);
    });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: BAR.inset,
        right: BAR.inset,
        bottom: barBottom,
      }}
    >
      <GestureDetector gesture={pan}>
      <Pill>
        <Capsule slot={slot} width={width} />

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
            color={inCall ? theme.color.success : GLASS_INK[theme.appearance].idle}
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
              borderColor: GLASS_INK[theme.appearance].ring,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PersonAvatar name={name} source={avatarUrl} size={BAR.avatar} />
          </View>
        </Tab>
      </Pill>
      </GestureDetector>
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
        /* The app's appearance rather than `auto`, which reads the phone. Those
           are the same answer while the preference is System and different the
           moment it is not — a light bar under an app pinned to dark is the bug
           this used to have in reverse. GRYT-813. */
        colorScheme={theme.appearance}
        style={shape}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={60}
      tint={
        theme.appearance === "light" ? "systemChromeMaterialLight" : "systemChromeMaterialDark"
      }
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
 * A real translucent colour rather than `theme.alpha.neutral`, which is
 * pre-composited against the page and would land on the glass as an opaque
 * grey lozenge — a hole in the bar rather than a highlight on it. `GLASS_INK`
 * has the whole of that reasoning.
 */
function Capsule({ slot, width }: { slot: SharedValue<number>; width: number }) {
  const theme = useTheme();
  const slotWidth = width / SLOT_COUNT;
  const capsuleWidth = slotWidth - PILL.inset * 2;

  const style = useAnimatedStyle(() => {
    /* Clamped because a page drag rubber-bands past its ends and the capsule
     * must not leave the bar with it. */
    const at = Math.min(Math.max(slot.value, 0), SLOT_COUNT - 1);
    /* Distance to the nearest slot, 0 at rest and 0.5 exactly between two. */
    const away = Math.abs(at - Math.round(at));

    return {
      transform: [
        { translateX: PILL.inset + at * slotWidth },
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
          backgroundColor: GLASS_INK[theme.appearance].capsule,
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
