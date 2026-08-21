import { useRouter, useSegments } from "expo-router";
import { TabList, TabTrigger, Tabs } from "expo-router/ui";
import { View } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

import { ConnectionProvider } from "../../src/connection/ConnectionProvider";
import { VoiceProvider } from "../../src/voice/VoiceProvider";
import { ServerSwitcher } from "../../src/shell/ServerSwitcher";
import { TabBar, type TabKey } from "../../src/shell/TabBar";
import { TabPager } from "../../src/shell/TabPager";
import { useShell } from "../../src/shell/ShellContext";
import { useMe } from "../../src/shell/useMe";
import { VoiceSheet } from "../../src/voice/VoiceSheet";

/** The three tabs, in bar order. The pager indexes into this. */
const TABS: { key: TabKey; href: string }[] = [
  { key: "(server)", href: "/(tabs)/(server)" },
  { key: "search", href: "/(tabs)/search" },
  { key: "you", href: "/(tabs)/you" },
];

/**
 * Which tab a route is on.
 *
 * Read off the segments rather than kept in state beside them, because a second
 * copy of "which tab am I on" is a copy that can disagree with where you
 * actually are. You used to be exactly that: a sheet, with a `youOpen` flag the
 * bar read instead of the route.
 */
function tabIndex(segments: string[]): number {
  if (segments.includes("you")) return 2;
  if (segments.includes("search")) return 1;
  return 0;
}

/**
 * The persistent navbar — ours now, not `UITabBar`.
 *
 * `expo-router/ui` rather than `expo-router/unstable-native-tabs`. The reasoning
 * for the native bar was that a tab bar "should feel native and have no Gryt
 * look", and that stood until the height became the requirement: `UITabBar` is
 * 62pt inside an 83pt container, neither is settable, and Apple's own forums
 * confirm iOS 26 has no API for a compact bar that keeps every icon visible.
 * Instagram's bar is not a `UITabBarController` either. GRYT-458 has the whole
 * argument.
 *
 * `TabList` is required by the router and is not what draws anything — the
 * triggers below register the routes, and `TabBar` is the thing you see. They
 * are kept in the same file deliberately: a trigger without a matching key in
 * the bar is a tab you cannot reach, and that is much easier to spot when both
 * lists are on one screen. `TABS` above is now the one list they both read.
 */
export default function TabsLayout() {
  const router = useRouter();
  const { server, voiceChannel } = useShell();
  const me = useMe(voiceChannel !== null);

  /**
   * Where the pager is, in pages, shared between the pager and the bar.
   *
   * Neither of them is the other's parent, and the bar has to know mid-drag
   * rather than on release — the capsule follows the finger. So it lives here,
   * which is the nearest thing they have in common.
   */
  const progress = useSharedValue(0);

  return (
    <ConnectionProvider host={server?.host ?? null} nickname={me.name}>
      {/* Inside the connection, because a room is granted by one server's
          socket and means nothing to another's. */}
      <VoiceProvider>
        {/* The bar is a *sibling* of `Tabs`, not a child, inside a flex box that
            gives them both something to be positioned against. Nested inside
            `Tabs` it rendered nothing visible: `Tabs` lays its children out in a
            flex column, so an absolutely-positioned child anchored to a
            zero-height slot has nothing to sit on. */}
        <View style={{ flex: 1 }}>
          <Tabs>
            <Pages progress={progress} />

            {/* Registers the routes and draws nothing. The bar is what you see;
                these are what the router needs to know the routes exist. */}
            <TabList style={{ display: "none" }}>
              {TABS.map((tab) => (
                <TabTrigger key={tab.key} name={tab.key} href={tab.href} />
              ))}
            </TabList>
          </Tabs>

          <Bar
            onSelect={(key) => router.navigate(TABS.find((t) => t.key === key)!.href)}
            name={me.name}
            progress={progress}
          />
        </View>

        {/* Beside the tabs rather than inside a screen, because each is
            reachable from the bar and has to cover it. The voice sheet also has
            to outlive the screen that opened it. The "you" sheet used to be
            here too, and is a route now — GRYT-471. */}
        <ServerSwitcher />
        <VoiceSheet />
      </VoiceProvider>
    </ConnectionProvider>
  );
}

/**
 * The three pageable screens, dragged between.
 *
 * You is one of them now. As a sheet it was the only tab that was not a place,
 * and the bar had to be told about it separately — the capsule interpolated
 * towards a slot the pager knew nothing about, because there was no third page
 * to be at.
 */
function Pages({ progress }: { progress: SharedValue<number> }) {
  const router = useRouter();
  const segments = useSegments();

  return (
    <TabPager
      index={tabIndex(segments)}
      order={TABS.map((tab) => tab.key)}
      progress={progress}
      onSettle={(next) => router.navigate(TABS[next].href)}
    />
  );
}

/**
 * Reads which tab is showing and hands it to the bar.
 *
 * Split out so it can sit under `Tabs` and use the router's own idea of the
 * current route.
 */
function Bar({
  onSelect,
  name,
  progress,
}: {
  onSelect: (key: TabKey) => void;
  name: string;
  progress: SharedValue<number>;
}) {
  const segments = useSegments();

  return (
    <TabBar
      active={TABS[tabIndex(segments)].key}
      onSelect={onSelect}
      name={name}
      progress={progress}
    />
  );
}
