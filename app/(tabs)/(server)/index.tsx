import { Redirect } from "expo-router";
import { View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

import { ServerScreen } from "../../../src/shell/ServerScreen";
import { firstTextChannelId } from "../../../src/shell/firstChannel";
import { useTwoPane } from "../../../src/shell/twoPane";
import { useServerConnection } from "../../../src/connection/ConnectionsProvider";

/**
 * The Server tab. On a tablet the list is in the column beside this one, so this screen
 * opens a channel rather than staying. The phone keeps the list as a screen (GRYT-822).
 */
export default function ServerTabIndex() {
  const theme = useTheme();
  const twoPane = useTwoPane();
  const { state } = useServerConnection();

  if (!twoPane) return <ServerScreen />;

  const first = firstTextChannelId({
    status: state.status,
    channels: state.status === "ready" ? state.channels : [],
    sidebar: state.status === "ready" ? state.sidebar : [],
  });

  /* `Redirect` rather than a `router.push` from an effect: it replaces, so nothing is
   * left on the stack pointing back here, and it happens during render. */
  if (first) return <Redirect href={{ pathname: "/channel/[id]", params: { id: first } }} />;

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.color.bg,
      }}
    >
      {/* Not "pick a channel" any more. By the time this draws there is none to
          pick: the server has only voice channels, which is legal and where a
          call is joined from the column rather than opened as a page, or every
          text channel is gated for this person.

          Nothing at all while the join settles. The column beside this one is
          already drawing `Status`, with a title and a line saying what it is
          waiting on, and two different messages about connecting side by side
          is worse than one. */}
      {state.status === "ready" ? (
        <Text style={{ color: theme.color.muted, textAlign: "center" }}>
          No channels to read here yet.
        </Text>
      ) : null}
    </View>
  );
}
