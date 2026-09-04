import { Stack } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { ServerScreen } from "../../../src/shell/ServerScreen";
import { SIDEBAR_WIDTH, useTwoPane } from "../../../src/shell/twoPane";

/**
 * The Server tab's own stack. A channel is pushed here rather than at the root,
 * so the tab bar stays visible — pushing at the root covers it, and leaving a
 * channel becomes the only way back to Search.
 *
 * Headers are off because both screens draw their own. `animation: "none"`
 * because a channel is somewhere you flick between rather than descend into;
 * the back gesture is `gestureEnabled` and unaffected.
 *
 * Wide enough, `ServerScreen` renders *beside* the stack rather than inside it,
 * so picking a channel changes only the right-hand side. **The same `<Stack>`
 * element serves both branches** — swapping between two on a rotation would
 * remount the channel and lose where you were. `index.tsx` is what keeps the
 * list from being drawn twice.
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
