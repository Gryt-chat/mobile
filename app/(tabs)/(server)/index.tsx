import { View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

import { ServerScreen } from "../../../src/shell/ServerScreen";
import { useTwoPane } from "../../../src/shell/twoPane";

/**
 * The Server tab. The active server's channels, under a header that opens the
 * switcher.
 *
 * On a phone that is this screen. On a tablet the list is already up in the
 * column beside this one — drawn by `_layout.tsx` — so rendering it here too
 * would put the same channels on screen twice, side by side. This is the
 * right-hand side before a channel is picked, and nothing more.
 */
export default function ServerTabIndex() {
  const theme = useTheme();
  const twoPane = useTwoPane();

  if (!twoPane) return <ServerScreen />;

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.color.bg,
      }}
    >
      <Text style={{ color: theme.color.muted }}>Pick a channel on the left.</Text>
    </View>
  );
}
