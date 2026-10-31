import { Stack } from "expo-router";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme } from "@gryt/ui-native";

import { MessagesScreen } from "../../../src/shell/MessagesScreen";
import { SIDEBAR_WIDTH, useTwoPane } from "../../../src/shell/twoPane";
import { useBookFold } from "../../../src/shell/useFold";
import { PANE_MOVE, SCREEN_FADE } from "../../../src/shell/screenFade";

/**
 * The Messages tab's own stack, so a conversation opened here stays on this tab (GRYT-1766).
 * The same `<Stack>` serves both widths, or a rotation remounts it.
 */
export default function MessagesStackLayout() {
  const theme = useTheme();
  const twoPane = useTwoPane();
  const fold = useBookFold();

  const stack = <Stack screenOptions={{ headerShown: false, ...SCREEN_FADE }} />;
  if (!twoPane) return stack;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <Animated.View layout={PANE_MOVE} style={fold ? { width: fold.x } : { width: SIDEBAR_WIDTH, borderRightWidth: 1, borderRightColor: theme.color.border }}>
        <MessagesScreen />
      </Animated.View>
      {fold ? <View style={{ width: fold.width }} /> : null}
      <Animated.View layout={PANE_MOVE} style={{ flex: 1 }}>{stack}</Animated.View>
    </View>
  );
}
