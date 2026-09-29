import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { ReturnToTabs } from "../src/shell/returnToTabs";

/**
 * Where the iOS share extension sends you. The URL carries nothing; the files are in the
 * App Group container. It exists because a URL with no route lands on "Unmatched Route".
 */
export default function Share() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ReturnToTabs />
    </View>
  );
}
