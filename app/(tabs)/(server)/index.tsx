import { Redirect } from "expo-router";
import { View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

import { ServerScreen } from "../../../src/shell/ServerScreen";
import { firstTextChannelId } from "../../../src/shell/firstChannel";
import { useTwoPane } from "../../../src/shell/twoPane";
import { useServerConnection } from "../../../src/connection/ConnectionsProvider";

/**
 * The Server tab. The active server's channels, under a header that opens the
 * switcher.
 *
 * On a phone that is this screen. On a tablet the list is already up in the
 * column beside this one — drawn by `_layout.tsx` — so rendering it here too
 * would put the same channels on screen twice.
 *
 * **On a tablet this screen is not somewhere you stay.** It used to be the
 * right-hand side before a channel was picked, which left two thirds of an iPad
 * reading "Pick a channel on the left" after every switch. There is always a
 * channel to open, so it opens one (GRYT-822).
 *
 * The phone keeps the list as its own screen: on one pane, opening a channel on
 * arrival would replace the only view of the server with a view of one room.
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

  /* `Redirect` rather than a `router.push` from an effect. It replaces, so
   * nothing is left on the stack pointing back here — and a screen you can
   * swipe back to is the state this removes. It also happens during render
   * rather than a frame after the empty pane has been drawn. */
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
