import { Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

/**
 * Where the iOS share extension sends you. The URL carries nothing — the share is the
 * files in the App Group container. **It exists because expo-router needs it to**: a
 * URL with no route lands on "Unmatched Route". Nothing here reads the share.
 */
export default function Share() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <Redirect href="/" />
    </View>
  );
}
