import { Text, useTheme } from "@gryt/ui-native";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Pressable, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from "react-native";

import { activityOn, nextActivity, type Side } from "./offscreenActivity";

type Offset = { y: number; height: number; parent?: string };

/**
 * Where the channels with something waiting are, against what's on screen. Null means
 * nothing on that side, 0 unread only, otherwise the mentions. `bottomInset` is the tab bar.
 */
export function useOffscreenActivity(activity: { key: string; mentions: number }[], bottomInset: number) {
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef(new Map<string, Offset>());
  const bodyY = useRef(0);
  const scrollY = useRef(0);
  const viewHeight = useRef(0);
  const [above, setAbove] = useState<number | null>(null);
  const [below, setBelow] = useState<number | null>(null);

  const placed = () =>
    activity.flatMap(({ key, mentions }) => {
      const own = offsets.current.get(key);
      if (!own) return [];
      const parent = own.parent ? offsets.current.get(own.parent)?.y ?? 0 : 0;
      return [{ key, mentions, top: bodyY.current + parent + own.y, height: own.height }];
    });
  const on = (side: Side) => activityOn(placed(), side, scrollY.current, scrollY.current + viewHeight.current - bottomInset);

  const measure = () => {
    if (viewHeight.current === 0) return;
    const count = (side: Side) => {
      const rows = on(side);
      return rows.length === 0 ? null : rows.reduce((sum, row) => sum + row.mentions, 0);
    };
    setAbove(count("above"));
    setBelow(count("below"));
  };
  // The counts change on any render, and these are numbers, so a repeat sets nothing.
  useEffect(measure);

  const place = (key: string, parent?: string) => (e: LayoutChangeEvent) => {
    offsets.current.set(key, { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height, parent });
    measure();
  };
  const go = (side: Side) => {
    const target = nextActivity(on(side));
    if (!target) return;
    const room = viewHeight.current - bottomInset;
    scroller.current?.scrollTo({ y: Math.max(0, target.top + target.height / 2 - room / 2), animated: true });
  };

  return {
    above,
    below,
    go,
    place,
    scrollerProps: {
      ref: scroller,
      scrollEventThrottle: 64,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
        measure();
      },
      onLayout: (e: LayoutChangeEvent) => {
        viewHeight.current = e.nativeEvent.layout.height;
        measure();
      },
    },
    onBodyLayout: (e: LayoutChangeEvent) => {
      bodyY.current = e.nativeEvent.layout.y;
      measure();
    },
  };
}

export function UnreadScrollPill({ side, waiting, inset, onPress }: {
  side: Side;
  waiting: number;
  /** How far in from that edge of the list. */
  inset: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const Arrow = side === "above" ? ArrowUpIcon : ArrowDownIcon;
  const label = waiting > 0 ? `${waiting} ${waiting === 1 ? "mention" : "mentions"}` : "New activity";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${side}, go to it`}
      hitSlop={6}
      style={({ pressed }) => ({
        position: "absolute",
        alignSelf: "center",
        [side === "above" ? "top" : "bottom"]: inset,
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(1.5),
        paddingHorizontal: theme.space(3.5),
        paddingVertical: theme.space(2),
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surfaceRaised,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Arrow size={13} color={theme.color.text} weight="bold" />
      <Text style={{ color: theme.color.accent, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
