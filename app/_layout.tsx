import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  GrytThemeProvider,
  SheetProvider,
  ToastProvider,
  TooltipProvider,
} from "@gryt/ui-native";

import { ShellProvider } from "../src/shell/ShellContext";

/**
 * Everything that used to be in `App.tsx`, plus a Stack around the tabs.
 *
 * The root is a Stack rather than the tab bar itself so that a screen can be
 * pushed *over* the bar — the component catalogue is one today and the channel
 * view will be another. Native tabs cannot be nested in native tabs and there
 * is no way to present a full-screen route above the bar without a Stack
 * ancestor, so this is the shape that does not have to be unpicked later.
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
              <SheetProvider>
                <ShellProvider>
                  <StatusBar style="light" />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen
                      name="dev"
                      options={{ presentation: "modal", headerShown: true, title: "Components" }}
                    />
                  </Stack>
                </ShellProvider>
              </SheetProvider>
            </ToastProvider>
          </TooltipProvider>
        </GrytThemeProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
