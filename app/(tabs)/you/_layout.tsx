import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { PreferencesScreen } from "../../src/preferences/PreferencesScreen";
import { YouScreen } from "../../src/shell/YouScreen";
import { SIDEBAR_WIDTH, useTwoPane } from "../../src/shell/twoPane";
import { useBookFold } from "../../src/shell/useFold";

/**
 * The You tab. The only one of the three that is not about a server, which is why it
 * survives when nothing is joined. Open, settings sit beside it instead of a tap away.
 */
export default function YouTab() {
  const theme = useTheme();
  const twoPane = useTwoPane();
  const fold = useBookFold();

  if (!twoPane) return <YouScreen />;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <View style={fold ? { width: fold.x } : { width: SIDEBAR_WIDTH + 40, borderRightWidth: 1, borderRightColor: theme.color.border }}>
        <YouScreen />
      </View>
      {fold ? <View style={{ width: fold.width }} /> : null}
      <View style={{ flex: 1 }}>
        <PreferencesScreen embedded />
      </View>
    </View>
  );
}
