import { useEffect, useRef } from "react";
import { useSegments } from "expo-router";
import { TabList, TabTrigger, Tabs, useTabTrigger } from "expo-router/ui";
import { View } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

import { ConnectionProvider } from "../../src/connection/ConnectionProvider";
import { VoiceProvider } from "../../src/voice/VoiceProvider";
import { LeaveServerDialog } from "../../src/servers/LeaveServerDialog";
import { ServerSwitcher } from "../../src/shell/ServerSwitcher";
import { TabBar } from "../../src/shell/TabBar";
import { TabPager } from "../../src/shell/TabPager";
import { PAGE_SLOT, TABS, type TabKey } from "../../src/shell/tabs";
import { useShell } from "../../src/shell/ShellContext";
import { useMe } from "../../src/shell/useMe";
import { VoiceSheet } from "../../src/voice/VoiceSheet";

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

/** What `Pages` publishes so the bar can use it. See `Pages`. */
type SwitchTab = (key: TabKey) => void;

/**
 * The persistent navbar — ours now, not `UITabBar`.
 *
 * `expo-router/ui` rather than `expo-router/unstable-native-tabs`. The reasoning
 * for the native bar was that a tab bar "should feel native and have no Gryt
 * look", and that stood until the height became the requirement: `UITabBar` is
 * 62pt inside an 83pt container, neither is settable, and Apple's own forums
 * confirm iOS 26 has no API for a compact bar that keeps every icon visible.
 * The design this is measured against is not a `UITabBarController` either.
 * GRYT-458 has the whole argument.
 *
 * `TabList` is required by the router and is not what draws anything — the
 * triggers below register the routes, and `TabBar` is the thing you see. They
 * are kept in the same file deliberately: a trigger without a matching key in
 * the bar is a tab you cannot reach, and that is much easier to spot when both
 * lists are on one screen. `TABS` is the one list they both read.
 */
export default function TabsLayout() {
  const { server, voiceChannel, setVoiceOpen } = useShell();
  const me = useMe(voiceChannel !== null);

  /**
   * Which slot the bar's capsule is at, 0 to 3, shared with the pager.
   *
   * Slots rather than pages because the bar can be dragged too, and half of
   * what a finger on it can point at is not a page. `src/shell/tabs.ts` has the
   * conversion and the argument.
   */
  const slot = useSharedValue(PAGE_SLOT[0]);

  /**
   * `switchTab`, published upwards.
   *
   * It is only callable from inside `Tabs`, and the bar is deliberately a
   * sibling of `Tabs` rather than a child — nested, it rendered nothing at all,
   * because `Tabs` lays its children out in a flex column and an absolutely
   * positioned child anchored to a zero-height slot has nothing to sit on. So
   * `Pages` puts it here and the bar reads it.
   */
  const switchTab = useRef<SwitchTab | null>(null);

  return (
    <ConnectionProvider host={server?.host ?? null} nickname={me.name}>
      {/* Inside the connection, because a room is granted by one server's
          socket and means nothing to another's. */}
      <VoiceProvider>
        <View style={{ flex: 1 }}>
          <Tabs>
            <Pages slot={slot} publish={switchTab} />

            {/* Registers the routes and draws nothing. The bar is what you see;
                these are what the router needs to know the routes exist. */}
            <TabList style={{ display: "none" }}>
              {TABS.map((tab) => (
                <TabTrigger key={tab.key} name={tab.key} href={tab.href} />
              ))}
            </TabList>
          </Tabs>

          <Bar
            onSelect={(key) => switchTab.current?.(key)}
            name={me.name}
            slot={slot}
            inCall={voiceChannel !== null}
            onCall={() => setVoiceOpen(true)}
          />
        </View>

        {/* Beside the tabs rather than inside a screen, because each is
            reachable from the bar and has to cover it. The voice sheet also has
            to outlive the screen that opened it. */}
        <ServerSwitcher />
        <LeaveServerDialog />
        <VoiceSheet />
      </VoiceProvider>
    </ConnectionProvider>
  );
}

/**
 * The three pageable screens, dragged between.
 *
 * **Switching tabs goes through `switchTab`, not `router.navigate`.** A tab's
 * `href` is its stack's *index*, so navigating to it popped whatever was on
 * that stack — open a channel, swipe to search, swipe back, and you were
 * looking at the channel list again. `switchTab` is what `TabTrigger` uses and
 * what bypassing triggers gave up; it leaves each tab's stack where it was.
 */
function Pages({
  slot,
  publish,
}: {
  slot: SharedValue<number>;
  publish: React.RefObject<SwitchTab | null>;
}) {
  const segments = useSegments();
  /* The name is required and any of the three would do — `switchTab` takes the
   * one it is switching to as an argument. */
  const { switchTab } = useTabTrigger({ name: TABS[0].key, href: TABS[0].href });

  useEffect(() => {
    publish.current = (key: TabKey) => switchTab(key, {});
    return () => {
      publish.current = null;
    };
  }, [switchTab, publish]);

  return (
    <TabPager
      index={tabIndex(segments)}
      order={TABS.map((tab) => tab.key)}
      slot={slot}
      onSettle={(next) => switchTab(TABS[next].key, {})}
    />
  );
}

/**
 * Reads which tab is showing and hands it to the bar.
 *
 * Split out so it can use the router's own idea of the current route.
 */
function Bar({
  onSelect,
  name,
  slot,
  inCall,
  onCall,
}: {
  onSelect: (key: TabKey) => void;
  name: string;
  slot: SharedValue<number>;
  inCall: boolean;
  onCall: () => void;
}) {
  const segments = useSegments();

  return (
    <TabBar
      active={TABS[tabIndex(segments)].key}
      onSelect={onSelect}
      name={name}
      slot={slot}
      inCall={inCall}
      onCall={onCall}
    />
  );
}
