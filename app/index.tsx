import { Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { useServers } from "../src/servers/store";

/**
 * Where the app starts. It goes to the tabs, always. **You is not about a server**, so
 * the empty state moved inside the Server tab rather than replacing the app. Nothing
 * at all until storage has answered, and the redirect only ever goes one way.
 */
export default function Index() {
  const theme = useTheme();
  const { ready } = useServers();

  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.color.bg }} />;

  return <Redirect href="/(tabs)/(server)" />;
}
