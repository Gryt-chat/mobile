import { Stack } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { MembersColumn } from "../../../src/shell/MembersColumn";
import { ServerRail } from "../../../src/shell/ServerRail";
import { ServerScreen } from "../../../src/shell/ServerScreen";
import { MEMBERS_COLUMN_WIDTH, SIDEBAR_WIDTH, useMembersColumn, useTwoPane } from "../../../src/shell/twoPane";
import { useBookFold } from "../../../src/shell/useFold";
import { SCREEN_FADE } from "../../../src/shell/screenFade";

/**
 * The Server tab's own stack. A channel is pushed here rather than at the root, so the
 * tab bar stays. The same `<Stack>` serves both widths, or a rotation remounts it.
 */
export default function ServerStackLayout() {
  const theme = useTheme();
  const twoPane = useTwoPane();
  const members = useMembersColumn();
  const fold = useBookFold();
  const { width, height } = useWindowDimensions();
  const sideways = width > height;

  const stack = <Stack screenOptions={{ headerShown: false, ...SCREEN_FADE }} />;
  if (!twoPane) return stack;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <View style={fold ? { width: fold.x, flexDirection: "row" } : { flexDirection: "row" }}>
        {sideways ? <ServerRail /> : null}
        <View
          style={
            fold
              ? { flex: 1 }
              : { width: SIDEBAR_WIDTH, borderRightWidth: 1, borderRightColor: theme.color.border }
          }
        >
          <ServerScreen />
        </View>
      </View>
      {fold ? <View style={{ width: fold.width }} /> : null}
      <View style={{ flex: 1 }}>{stack}</View>
      {members ? (
        <View style={{ width: MEMBERS_COLUMN_WIDTH, borderLeftWidth: 1, borderLeftColor: theme.color.border }}>
          <MembersColumn />
        </View>
      ) : null}
      {sideways ? null : <ServerRail />}
    </View>
  );
}
