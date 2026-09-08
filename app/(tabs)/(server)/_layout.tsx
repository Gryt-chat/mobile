import { Stack } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { ServerScreen } from "../../../src/shell/ServerScreen";
import { SIDEBAR_WIDTH, useTwoPane } from "../../../src/shell/twoPane";

/**
 * The Server tab's own stack. A channel is pushed here rather than at the root, so the
 * tab bar stays. The same `<Stack>` serves both widths, or a rotation remounts it.
 */
export default function ServerStackLayout() {
  const theme = useTheme();
  const twoPane = useTwoPane();

  const stack = <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
  if (!twoPane) return stack;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <View
        style={{
          width: SIDEBAR_WIDTH,
          borderRightWidth: 1,
          borderRightColor: theme.color.border,
        }}
      >
        <ServerScreen />
      </View>
      <View style={{ flex: 1 }}>{stack}</View>
    </View>
  );
}
