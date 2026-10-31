import { Stack } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { MessagesScreen } from "../../../src/shell/MessagesScreen";
import { SIDEBAR_WIDTH, useTwoPane } from "../../../src/shell/twoPane";

/**
 * The Messages tab's own stack, so a conversation opened here stays on this tab (GRYT-1766).
 * The same `<Stack>` serves both widths, or a rotation remounts it.
 */
export default function MessagesStackLayout() {
  const theme = useTheme();
  const twoPane = useTwoPane();

  const stack = <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
  if (!twoPane) return stack;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <View style={{ width: SIDEBAR_WIDTH, borderRightWidth: 1, borderRightColor: theme.color.border }}>
        <MessagesScreen />
      </View>
      <View style={{ flex: 1 }}>{stack}</View>
    </View>
  );
}
