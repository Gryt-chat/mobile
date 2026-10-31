import { Stack } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { useTabBarSpace } from "../../../src/shell/TabBar";
import { YouScreen } from "../../../src/shell/YouScreen";
import { useTwoPane } from "../../../src/shell/twoPane";
import { useBookFold } from "../../../src/shell/useFold";

/**
 * The You tab. Open, your card stays on the left and settings change on the right.
 * The same `<Stack>` serves both widths, or a rotation remounts it.
 */
export default function YouLayout() {
  const theme = useTheme();
  const twoPane = useTwoPane();
  const fold = useBookFold();
  const barSpace = useTabBarSpace();

  const stack = (
    <Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: { paddingBottom: twoPane ? barSpace : 0 } }}>
      <Stack.Screen name="index" options={{ contentStyle: { paddingBottom: 0 } }} />
    </Stack>
  );
  if (!twoPane) return stack;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <View style={fold ? { width: fold.x } : { width: 320, borderRightWidth: 1, borderRightColor: theme.color.border }}>
        <YouScreen />
      </View>
      {fold ? <View style={{ width: fold.width }} /> : null}
      <View style={{ flex: 1 }}>{stack}</View>
    </View>
  );
}
