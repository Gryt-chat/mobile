import { Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

/**
 * Where the iOS share extension sends you. The URL carries nothing; the files are in the
 * App Group container. It exists because a URL with no route lands on "Unmatched Route".
 */
export default function Share() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <Redirect href="/" />
    </View>
  );
}
