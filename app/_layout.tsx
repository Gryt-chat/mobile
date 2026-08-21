import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  GrytThemeProvider,
  SheetProvider,
  ToastProvider,
  TooltipProvider,
} from "@gryt/ui-native";

import { AddServerSheet } from "../src/servers/AddServerSheet";
import { AccountProvider } from "../src/account/AccountProvider";
import { ServersProvider } from "../src/servers/store";
import { ShellProvider, useShell } from "../src/shell/ShellContext";

/**
 * Everything that used to be in `App.tsx`, plus a Stack around the tabs.
 *
 * The root is a Stack rather than the tab bar itself so that a screen can be
 * pushed *over* the bar. Native tabs cannot be nested in native tabs and there
 * is no way to present a full-screen route above the bar without a Stack
 * ancestor, so this is the shape that does not have to be unpicked later.
 *
 * The Stack is rendered **unconditionally**, including when no server has been
 * joined. Branching here instead — rendering the empty scene in place of the
 * navigator — meant an invite link had nothing to match against, and
 * `gryt://invite?host=…` landed on expo-router's own "Unmatched Route" screen.
 * The router owns the URL, so a URL the app handles has to be a route.
 *
 * GestureHandlerRootView stays outermost with flex: 1. On Android gestures
 * below a missing root never fire — no error, no warning — and iOS is more
 * forgiving, which is exactly why it is easy to ship broken.
 *
 * `SafeAreaProvider` is deliberately absent: `ExpoRoot` mounts one above this
 * file, so a second would be a nested provider reporting the inner frame.
 *
 * `ThemeProvider value={DarkTheme}` is the router's own theme rather than
 * Gryt's, and it is here for one thing only: without it the gap between two
 * tabs is painted with React Navigation's default light background, which
 * flashes white on a dark app. `GrytThemeProvider` below it is what every
 * component actually reads.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        {/* Dark with no system following, matching what GrytProvider does on
            the web. Gryt is a dark product and light is the exception. */}
        <GrytThemeProvider appearance="dark">
          <TooltipProvider>
            <ToastProvider>
              <AccountProvider>
              {/* Above `SheetProvider` on purpose. A Sheet renders its content
                  through `@gorhom/portal`, which puts it where the *host* is
                  rather than where it was written, and the host is
                  `SheetProvider` — so anything provided below that point does
                  not exist inside a sheet. The You sheet reads this outside and
                  passes it down, which is the convention there, but a provider
                  that has to be above the portal host should be above it. */}
              <SheetProvider>
                <ServersProvider>
                  <ShellProvider>
                    <StatusBar style="light" />
                    {/*
                      The navigator and the sheet are siblings, and the wrapper
                      is what gives them a box to be siblings in. Without a
                      flex: 1 parent the sheet is laid out in a zero-height slot
                      and anchors to it — it draws part-way down the screen with
                      the content showing through, which reads as a sheet
                      entering from the top. Same shape as the bug in GRYT-396,
                      a layer up.
                    */}
                    <View style={{ flex: 1 }}>
                      {/* `animation: "none"` — a route change is a jump, not a fade. See the
                          note in the Server tab's own stack. `dev` overrides it below,
                          because a modal that appears without sliding up reads as a
                          glitch rather than as a sheet. */}
                      <Stack screenOptions={{ headerShown: false, animation: "none" }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="invite" />
                        <Stack.Screen name="identity" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen
                          name="dev"
                          options={{
                            presentation: "modal",
                            headerShown: true,
                            title: "Components",
                            animation: "default",
                          }}
                        />
                      </Stack>
                      {/* Above the navigator, so it covers whatever is under
                          it and survives the redirect from `index` to the
                          tabs. */}
                      <GlobalAddServerSheet />
                    </View>
                  </ShellProvider>
                </ServersProvider>
              </SheetProvider>
              </AccountProvider>
            </ToastProvider>
          </TooltipProvider>
        </GrytThemeProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function GlobalAddServerSheet() {
  const { addServerOpen, setAddServerOpen, invite, setInvite } = useShell();

  return (
    <AddServerSheet
      open={addServerOpen}
      onOpenChange={(next) => {
        setAddServerOpen(next);
        // Cleared on close so reopening it by hand does not resurrect an
        // invite that has already been dealt with.
        if (!next) setInvite(undefined);
      }}
      initialInput={invite}
    />
  );
}
