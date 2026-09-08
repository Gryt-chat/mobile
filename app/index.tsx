import { Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { useServers } from "../src/servers/store";

/**
 * Where the app starts: the tabs, always. The empty state lives inside the Server tab
 * rather than replacing the app. Nothing until storage answers, and it redirects once.
 */
export default function Index() {
  const theme = useTheme();
  const { ready } = useServers();

  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.color.bg }} />;

  return <Redirect href="/(tabs)/(server)" />;
}
