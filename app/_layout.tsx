import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useFonts } from "expo-font";
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
import { AppearanceProvider, useAppearance } from "../src/preferences/appearance";
import { DeviceProfileProvider } from "../src/profile/deviceProfile";
import { ServersProvider } from "../src/servers/store";
import { LeaveOnSignOut } from "../src/account/LeaveOnSignOut";
import { RecentsProvider } from "../src/share/RecentsProvider";
import { ShellProvider, useShell } from "../src/shell/ShellContext";
import { Welcome, WelcomeProvider } from "../src/shell/Welcome";
import { ActionSheetHost } from "../src/ui/actionSheet";
import { FONT_ASSETS, GRYT_FONTS } from "../src/ui/fonts";

/**
 * The providers, plus a Stack around the tabs, rendered unconditionally or an invite has
 * nothing to match. `GestureHandlerRootView` outermost; `ExpoRoot` mounts the safe area.
 */
export default function RootLayout() {
  /**
   * Atkinson Hyperlegible, before anything draws: every line changes width when the
   * family lands. `error` is treated as loaded — the system font beats no app.
   */
  const [loaded, error] = useFonts(FONT_ASSETS);
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Above every provider, including the two that paint. What it holds is
          about this phone rather than about a server or an account — how
          messages are drawn, whether Gryt makes a noise, and which appearance
          the app is in. The last of those is why it is up here. */}
      <AppearanceProvider>
        <Themed />
      </AppearanceProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Everything below the appearance, in its own component because `useAppearance` has to
 * be called under its own provider. Held back until the stored preference is read.
 */
function Themed() {
  const { resolvedAppearance, ready } = useAppearance();
  if (!ready) return null;

  const light = resolvedAppearance === "light";

  return (
    <ThemeProvider value={light ? DefaultTheme : DarkTheme}>
      {/* The faces go to the provider, not just to `useFonts`. Registering
          them is what makes the names resolvable; handing them here is what
          makes every `Text` the library draws use one — a Button label and
          the text beside it were in different fonts until this line. */}
      <GrytThemeProvider appearance={resolvedAppearance} fonts={GRYT_FONTS}>
        <TooltipProvider>
          <ToastProvider>
            <AccountProvider>
            {/* Above the servers, because it is not about one. The name and
                picture here belong to the phone: they are what a join
                carries, and what the You page shows when you are in no
                server at all. GRYT-498. */}
            <DeviceProfileProvider>
            {/* Above `SheetProvider` on purpose. A Sheet renders its content
                through `@gorhom/portal`, which puts it where the *host* is
                rather than where it was written, and the host is
                `SheetProvider` — so anything provided below that point does
                not exist inside a sheet. The You sheet reads this outside and
                passes it down, which is the convention there, but a provider
                that has to be above the portal host should be above it. */}
            <SheetProvider>
              {/* Above the shell, so anything below can ask a question, and
                  *inside* everything that provides a theme — the Android
                  implementation is drawn by this app rather than by UIKit.

                  Deliberately not below `ShellProvider`: the switcher drawer
                  lives there and is a React Native `Modal`, and a sheet
                  rendered inside one is a sheet that closes with it. */}
              <ActionSheetHost>
              <ServersProvider>
                {/* Draws nothing. Leaves the servers that belonged to the
                    account when somebody signs out of it — here rather than
                    inside `signOut`, so it covers every route to signing out
                    including the auth-server change. GRYT-572. */}
                <LeaveOnSignOut />
                {/* Inside the server list, because it prunes itself against
                    it — a recent channel on a server you have left is a row
                    that cannot be tapped. Above the shell, because the share
                    picker reads it and so does the channel screen that
                    records it. */}
                <RecentsProvider>
                <WelcomeProvider>
                <ShellProvider>
                  {/* The bar's own glyphs, so they are dark on a light app
                      and light on a dark one. `style` names the content
                      rather than the background, which is why this reads
                      backwards. */}
                  <StatusBar style={light ? "dark" : "light"} />
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
                      <Stack.Screen name="share" />
                      <Stack.Screen name="identity" />
                      <Stack.Screen name="preferences" />
                      <Stack.Screen name="auth-server" />
                      <Stack.Screen name="report" />
                      <Stack.Screen name="discovery" />
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
                    {/* Last, so it is over the add-server sheet too: the
                        greeting is the first thing, and somebody landing on
                        a cold start should read it before being asked to
                        join anything. */}
                    <Welcome />
                  </View>
                </ShellProvider>
                </WelcomeProvider>
                </RecentsProvider>
              </ServersProvider>
              </ActionSheetHost>
            </SheetProvider>
            </DeviceProfileProvider>
            </AccountProvider>
          </ToastProvider>
        </TooltipProvider>
      </GrytThemeProvider>
    </ThemeProvider>
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
