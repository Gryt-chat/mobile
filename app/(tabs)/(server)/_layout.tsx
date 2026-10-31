import { Stack } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { MembersColumn } from "../../../src/shell/MembersColumn";
import { ServerRail } from "../../../src/shell/ServerRail";
import { ServerScreen } from "../../../src/shell/ServerScreen";
import { MEMBERS_COLUMN_WIDTH, SIDEBAR_WIDTH, useMembersColumn, useTwoPane } from "../../../src/shell/twoPane";
import { useBookFold } from "../../../src/shell/useFold";

/** Half open, the members shrink to fit beside the channels in the left half. */
const FOLDED_MEMBERS_WIDTH = 190;

/**
 * The Server tab's own stack. A channel is pushed here rather than at the root, so the
 * tab bar stays. The same `<Stack>` serves both widths, or a rotation remounts it.
 */
export default function ServerStackLayout() {
  const theme = useTheme();
  const twoPane = useTwoPane();
  const members = useMembersColumn();
  const fold = useBookFold();

  const stack = <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
  if (!twoPane) return stack;

  const membersColumn = (width: number) => (
    <View style={{ width, borderLeftWidth: 1, borderLeftColor: theme.color.border }}>
      <MembersColumn />
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <View style={fold ? { width: fold.x, flexDirection: "row" } : { flexDirection: "row" }}>
        {members ? <ServerRail /> : null}
        <View
          style={
            fold
              ? { flex: 1 }
              : { width: SIDEBAR_WIDTH, borderRightWidth: 1, borderRightColor: theme.color.border }
          }
        >
          <ServerScreen />
        </View>
        {fold ? membersColumn(FOLDED_MEMBERS_WIDTH) : null}
      </View>
      {fold ? <View style={{ width: fold.width }} /> : null}
      <View style={{ flex: 1 }}>{stack}</View>
      {members && !fold ? membersColumn(MEMBERS_COLUMN_WIDTH) : null}
      {members ? null : <ServerRail />}
    </View>
  );
}
