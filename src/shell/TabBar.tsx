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
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { FLICK, PAGE_SLOT, SLOT_COUNT, TABS, nearestPage, type TabKey } from "./tabs";
import { TRAVEL } from "./tabMotion";

/**
 * The bar, measured off the Figma file. **That frame is 603×1311, a 402×874 iPhone
 * at exactly 1.5×, so every number below is the design's over 1.5.**
 */
export const BAR = {
  /** 90px in the design. */
  height: 60,
  /** 32px in from each edge, of 603. */
  inset: 21,
  /**
   * 32px off the bottom of the frame — **the screen's bottom, not the safe area's**.
   * On iOS the inset is 34pt and the indicator inside it 8 to 13.
   */
  bottom: 21,
  /** Clearance between the pill and an opaque system bar underneath it. */
  systemGap: 8,
  /** 45px. Half the height, so a true pill. */
  radius: 30,
  /**
   * 32px, which is Phosphor's own box at its default size: the design's glyph paths
   * are Phosphor regular dropped in unchanged.
   */
  icon: 21.33,
  /** The avatar is drawn larger than the glyphs, 38px to their 32. */
  avatar: 25.33,
  /** 2px of white around the avatar, and nothing around the glyphs. */
  avatarRing: 1.33,
  /**
   * Clear air above the bar, for anything that reserves room below itself. Without
   * it a composer's bottom edge lands on the bar's top edge.
   */
  gap: 12,
};

/**
 * The selected capsule: its slot, inset by the same amount on all four sides. **One
 * number, not two**, and **the slots are equal divisions of the whole bar**.
 */
const PILL = { inset: 6 };

/**
 * Ink on the glass. **Translucent rather than `theme.color.*`**, which are solid
 * and land on glass as a hole. **The alphas are not mirrored.**
 */
const GLASS_INK = {
  dark: {
    ring: "rgba(255, 255, 255, 0.9)",
    capsule: "rgba(255, 255, 255, 0.14)",
  },
  light: {
    ring: "rgba(0, 0, 0, 0.15)",
    capsule: "rgba(0, 0, 0, 0.08)",
  },
} as const;

/**
 * How far the capsule stretches while travelling — longest halfway between two
 * tabs. Driven off the distance to the nearest slot, so a drag matches a tap.
 */
const STRETCH = 0.28;

/**
 * How much room the bar takes out of the bottom of every screen. **The whole
 * distance from the screen's bottom, safe area included. Screens add nothing.**
 */
export function useTabBarSpace(): number {
  return BAR.height + useBarBottom() + BAR.gap;
}

/**
 * How far the pill sits above the bottom of the screen. **The two platforms mean
 * different things by `insets.bottom`** — a home indicator, or a navigation bar.
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
   * Which slot the capsule is at, 0 to 3, continuously. Shared with the pager and
   * written by both. `active` is the settled answer, for the tint and VoiceOver.
   */
  slot: SharedValue<number>;
  /** Puts the call back on screen. */
}

/**
 * Our own tab bar, replacing `expo-router/unstable-native-tabs`: that one refused
 * Phosphor icons. **`BlurView` survives as the fallback** (GRYT-458).
 */
export function TabBar({ active, onSelect, name, avatarUrl, slot }: TabBarProps) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const barBottom = useBarBottom();
  const width = window.width - BAR.inset * 2;
  const slotWidth = width / SLOT_COUNT;

  /** Where the capsule was when the finger went down. */
  const grabbed = useSharedValue(0);

  /**
   * Dragging the bar itself. The page's own pan is the other half; both write
   * `slot`. `activeOffsetX` so a tap still reaches the tab under it.
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

        <Tab onPress={() => onSelect("search")} selected={active === "search"} label="Search">
          <MagnifyingGlassIcon
            size={BAR.icon}
            /* Regular in both states: the design lets the capsule and the colour
               say which is on, and a thickening glyph is a second answer. */
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
 * `isLiquidGlassAvailable`, which is false when the effect is turned off too.
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
        /* The bar reacts to a touch the way the system's own does. It is the one
           thing `GlassView` does that drawing on a blur cannot reproduce. */
        isInteractive
        /* The app's appearance rather than `auto`, which reads the phone: a light
           bar under an app pinned to dark is the bug in reverse (GRYT-813). */
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
        /* A hairline, because a blur over a dark app has no edge of its own. Glass
           has one and does not want this. */
        borderWidth: 1,
        borderColor: theme.alpha.neutral[3],
      }}
    >
      {children}
    </BlurView>
  );
}

/**
 * The capsule behind the selected tab: one that moves, positioned with
 * `translateX` rather than a percentage `left`, which would relayout every frame.
 * The width is arithmetic, so it is right on the first frame.
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
 * One slot in the bar. Equal flex rather than measured widths, and the capsule
 * above depends on it — it positions itself in thirds.
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
