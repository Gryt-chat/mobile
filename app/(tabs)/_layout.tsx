import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@gryt/ui-native";

import { ServerSwitcher } from "../../src/shell/ServerSwitcher";
import { useShell } from "../../src/shell/ShellContext";
import { YouSheet } from "../../src/shell/YouSheet";

/**
 * The persistent navbar: a real `UITabBar` on iOS, Material bottom navigation
 * on Android.
 *
 * `expo-router`'s native tabs rather than `@expo/ui`'s `TabView`, which is
 * iOS-only and whose own documentation points here: "for routed bottom-tab
 * navigation across full-screen routes, prefer
 * expo-router/unstable-native-tabs".
 *
 * That is not a reversal of declining `@expo/ui` for the design system. The
 * carve-out recorded then was "things that should feel native and have no Gryt
 * look", and a tab bar is exactly that case — which is also why the icons here
 * are SF Symbols and Material glyphs rather than the Phosphor set the rest of
 * the app uses. The native bar will not take an arbitrary React element: `src`
 * accepts an image source or a `VectorIcon` whose family exposes
 * `getImageSource`, and anything else is dropped with a console warning.
 * Phosphor is `react-native-svg` components and has no such method.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { setYouOpen } = useShell();

  return (
    <>
      <NativeTabs
        backgroundColor={theme.color.surface}
        iconColor={{ default: theme.color.muted, selected: theme.color.accent }}
        tintColor={theme.color.accent}
        indicatorColor={theme.alpha.accent[3]}
        rippleColor={theme.alpha.accent[3]}
        labelStyle={{
          default: { color: theme.color.muted },
          selected: { color: theme.color.accent },
        }}
        /**
         * The avatar opens a sheet rather than going anywhere, which a native
         * tab bar does not do on its own: `tabPress` is declared
         * `canPreventDefault: false`, so a listener is told after the fact and
         * cannot cancel the navigation.
         *
         * `disabled` on that trigger is the way out, and it is deliberate
         * rather than a trick — the navigator emits `tabPress` with
         * `isPrevented` and returns without advancing. So the tap is heard and
         * nothing moves. The route file behind it exists because a trigger has
         * to name a route, and is never shown.
         */
        screenListeners={({ route }) => ({
          tabPress: () => {
            if (route.name === "you") setYouOpen(true);
          },
        })}
      >
        <NativeTabs.Trigger name="(server)">
          <NativeTabs.Trigger.Label>Server</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{
              default: "bubble.left.and.bubble.right",
              selected: "bubble.left.and.bubble.right.fill",
            }}
            md="forum"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="search">
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="you" disabled>
          <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
            md="account_circle"
          />
        </NativeTabs.Trigger>
      </NativeTabs>

      {/* Both live beside the tabs rather than inside a screen, because both
          are reachable from the bar and have to cover it. */}
      <ServerSwitcher />
      <YouSheet />
    </>
  );
}
