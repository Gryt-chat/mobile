import { Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { NoServers } from "../src/servers/NoServers";
import { useServers } from "../src/servers/store";
import { useShell } from "../src/shell/ShellContext";

/**
 * Where the app starts, and the only place that decides which app you get.
 *
 * With no servers there is nothing for the navbar to be about — "Server" has no
 * server and "Search" has nothing to search — so the empty scene is the whole
 * screen rather than a state inside a tab.
 *
 * The redirect only ever goes one way. This route sends you to the tabs when
 * there is a server; nothing in the tabs sends you back here, so there is no
 * pair of routes that can bounce you between them.
 */
export default function Index() {
  const theme = useTheme();
  const { servers, ready } = useServers();
  const { setAddServerOpen } = useShell();

  // Nothing at all until storage has answered. One frame of "no servers" shown
  // to somebody who has four is worse than one frame of nothing.
  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.color.bg }} />;

  if (servers.length > 0) return <Redirect href="/(tabs)/(server)" />;

  return <NoServers onAdd={() => setAddServerOpen(true)} />;
}
