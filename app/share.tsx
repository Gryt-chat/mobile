import { Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

/**
 * Where the iOS share extension sends you.
 *
 * `gryt://share`, opened by `targets/share/ShareViewController.swift` once it
 * has copied what was shared into the App Group container. The URL carries
 * nothing: the share itself is the files in that container, and
 * `modules/share-intent` reads them. This is only the doorbell.
 *
 * **It exists because expo-router needs it to.** A URL with no route lands on
 * the router's own "Unmatched Route" screen, which is what an invite link did
 * before `app/invite.tsx` was written. Redirecting straight out is what turns
 * "Gryt opened on an error page" into "Gryt opened".
 *
 * Nothing here reads the share. The picker mounts under the tabs, which is
 * where the channel list lives, and it consumes on foreground — so a cold start
 * through this route and a share arriving at an app already running take the
 * same path.
 */
export default function Share() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <Redirect href="/" />
    </View>
  );
}
