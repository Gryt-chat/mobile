import { Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { useServers } from "../src/servers/store";

/**
 * Where the app starts. It goes to the tabs, always.
 *
 * This used to render the empty scene as the whole screen when there were no
 * servers. That was wrong about the third tab: **You is not about a server.**
 * Signing in, reading your identity, opening settings and giving feedback are
 * all things somebody should be able to do before joining anything, and hiding
 * the navbar until they had a server put every one of them out of reach on the
 * one screen where a new person actually is.
 *
 * So the empty state moved inside the Server tab, where it is a state of that
 * tab rather than a replacement for the app.
 *
 * Nothing at all until storage has answered. One frame of "no servers" shown to
 * somebody who has four is worse than one frame of nothing.
 *
 * The redirect only ever goes one way: this route sends you to the tabs, and
 * nothing in the tabs sends you back, so there is no pair that can bounce you.
 */
export default function Index() {
  const theme = useTheme();
  const { ready } = useServers();

  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.color.bg }} />;

  return <Redirect href="/(tabs)/(server)" />;
}
