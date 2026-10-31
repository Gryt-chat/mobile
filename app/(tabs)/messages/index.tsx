import { View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

import { MessagesScreen } from "../../../src/shell/MessagesScreen";
import { useTwoPane } from "../../../src/shell/twoPane";

/** The Messages tab: direct messages across every server, and friends (GRYT-1747). */
export default function MessagesIndex() {
  const theme = useTheme();
  const twoPane = useTwoPane();

  if (!twoPane) return <MessagesScreen />;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.bg }}>
      <Text style={{ color: theme.color.muted }}>Pick a conversation</Text>
    </View>
  );
}
