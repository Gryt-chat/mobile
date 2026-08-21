import { useRouter, useSegments } from "expo-router";
import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { View } from "react-native";

import { ConnectionProvider } from "../../src/connection/ConnectionProvider";
import { VoiceProvider } from "../../src/voice/VoiceProvider";
import { ServerSwitcher } from "../../src/shell/ServerSwitcher";
import { TabBar, type TabKey } from "../../src/shell/TabBar";
import { useShell } from "../../src/shell/ShellContext";
import { ME } from "../../src/shell/data";
import { YouSheet } from "../../src/shell/YouSheet";
import { VoiceSheet } from "../../src/voice/VoiceSheet";

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
 * lists are on one screen.
 */
export default function TabsLayout() {
  const router = useRouter();
  const { setYouOpen, server } = useShell();

  /**
   * You opens a sheet rather than going anywhere.
   *
   * With the native bar this needed `disabled` on the trigger and a listener,
   * because `tabPress` was declared `canPreventDefault: false` and a route had
   * to exist behind it regardless. Our bar just calls a function, so the whole
   * workaround is gone — and so is `app/(tabs)/you.tsx`, which only ever
   * existed to give that trigger a route to name.
   */
  const select = (key: TabKey) => {
    if (key === "you") {
      setYouOpen(true);
      return;
    }
    router.navigate(key === "(server)" ? "/(tabs)/(server)" : "/(tabs)/search");
  };

  return (
    <ConnectionProvider host={server?.host ?? null} nickname={ME.name}>
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
            <TabSlot />

            {/* Registers the routes and draws nothing. The bar is what you see;
                these are what the router needs to know the routes exist. */}
            <TabList style={{ display: "none" }}>
              <TabTrigger name="server" href="/(tabs)/(server)" />
              <TabTrigger name="search" href="/(tabs)/search" />
            </TabList>
          </Tabs>

          <Bar onSelect={select} />
        </View>

        {/* All three live beside the tabs rather than inside a screen, because
            each is reachable from the bar and has to cover it. The voice sheet
            also has to outlive the screen that opened it. */}
        <ServerSwitcher />
        <YouSheet />
        <VoiceSheet />
      </VoiceProvider>
    </ConnectionProvider>
  );
}

/**
 * Reads which tab is showing and hands it to the bar.
 *
 * Split out so it can sit under `Tabs` and use the router's own idea of the
 * current route, rather than the layout keeping a second copy of it in state
 * that could drift from where you actually are.
 */
function Bar({ onSelect }: { onSelect: (key: TabKey) => void }) {
  const segments = useSegments();
  const { youOpen } = useShell();

  /* The route decides, not a piece of state beside it — a second copy of "which
   * tab" is a copy that can disagree with where you actually are. You is the
   * exception because it is not a route at all: it is a sheet, so while it is
   * open the bar shows it as the one you are on. */
  const active: TabKey = youOpen ? "you" : segments.includes("search") ? "search" : "(server)";

  return <TabBar active={active} onSelect={onSelect} name={ME.name} />;
}
