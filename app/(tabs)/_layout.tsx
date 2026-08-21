import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@gryt/ui-native";

import { useAvatarIcon } from "../../src/avatar/useAvatarIcon";

import { ConnectionProvider } from "../../src/connection/ConnectionProvider";
import { VoiceProvider } from "../../src/voice/VoiceProvider";
import { ServerSwitcher } from "../../src/shell/ServerSwitcher";
import { useShell } from "../../src/shell/ShellContext";
import { ME } from "../../src/shell/data";
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
 *
 * **No labels, so the bar is short.** Instagram's shape, and it is two different
 * levers: Android takes `labelVisibilityMode="unlabeled"`, and iOS needs each
 * trigger to carry `<Label hidden />`.
 *
 * `hidden` rather than dropping the `Label` child, which is the obvious thing
 * and is wrong. With no `Label`, `NativeTabsView` falls back to `options.title
 * ?? name` and labels the tab with its **route name** — so the first attempt
 * replaced "Server" with a literal "(server)", parentheses and all. `hidden`
 * sets the title to an empty string, which is not nullish and so survives that
 * fallback.
 *
 * The labels are gone from the bar and not from the app: each trigger keeps an
 * `accessibilityLabel`, because "no text" is a visual decision and VoiceOver
 * still has to name three identical-sounding buttons.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { setYouOpen, server } = useShell();

  /* The You tab is the person's own face rather than a generic glyph. It has to
   * be rasterised on device first — see useAvatarIcon — so `source` is null for
   * the first frame or two and null forever if the readback fails. `sf` stays
   * as the fallback, because an Icon handed a source it cannot use renders
   * nothing at all. */
  const { source: avatar, offscreen } = useAvatarIcon(ME.name);

  return (
    <ConnectionProvider host={server?.host ?? null} nickname={ME.name}>
      {/* Inside the connection, because a room is granted by one server's
          socket and means nothing to another's. */}
      <VoiceProvider>
      <NativeTabs
        backgroundColor={theme.color.surface}
        iconColor={{ default: theme.color.muted, selected: theme.color.accent }}
        tintColor={theme.color.accent}
        indicatorColor={theme.alpha.accent[3]}
        rippleColor={theme.alpha.accent[3]}
        labelVisibilityMode="unlabeled"
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
        <NativeTabs.Trigger name="(server)" accessibilityLabel="Server">
          <NativeTabs.Trigger.Label hidden />
          <NativeTabs.Trigger.Icon
            sf={{
              default: "bubble.left.and.bubble.right",
              selected: "bubble.left.and.bubble.right.fill",
            }}
            md="forum"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="search" accessibilityLabel="Search">
          <NativeTabs.Trigger.Label hidden />
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="you" accessibilityLabel="You" disabled>
          <NativeTabs.Trigger.Label hidden />
          {/* `renderingMode="original"` or iOS flattens the face into a
              single-colour template, which is what a tab icon usually wants and
              the exact opposite of what an avatar is for. */}
          {avatar ? (
            <NativeTabs.Trigger.Icon src={avatar} renderingMode="original" />
          ) : (
            <NativeTabs.Trigger.Icon
              sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
              md="account_circle"
            />
          )}
        </NativeTabs.Trigger>
      </NativeTabs>

      {/* Both live beside the tabs rather than inside a screen, because both
          are reachable from the bar and have to cover it. */}
      <ServerSwitcher />
      <YouSheet />
      {/* Has to be in the tree for `toDataURL` to have anything to read back.
          Invisible and zero-sized; see useAvatarIcon. */}
      {offscreen}
      </VoiceProvider>
    </ConnectionProvider>
  );
}
