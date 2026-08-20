import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { PlugsIcon } from "phosphor-react-native/src/icons/Plugs";

import { ServerHeader } from "./ServerHeader";
import { useShell } from "./ShellContext";

/**
 * The Server tab: the header, and the channels once there are any.
 *
 * There are none. Channels arrive over the socket, and nothing here opens one
 * yet — the fake list that used to be here is gone rather than kept as a
 * placeholder, because a list of channels you cannot open is indistinguishable
 * from a server that is failing to load.
 *
 * The quick cards went with it for the same reason: "4 new" was counting
 * fixtures.
 */
export function ServerScreen() {
  const theme = useTheme();
  const { server } = useShell();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ServerHeader />

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: theme.space(8),
            gap: theme.space(3),
          }}
        >
          <PlugsIcon size={36} color={theme.color.muted} />
          <Text
            style={{
              color: theme.color.text,
              fontSize: 18,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            Not connected yet
          </Text>
          <Text
            style={{
              color: theme.color.muted,
              fontSize: 15,
              lineHeight: 21,
              textAlign: "center",
            }}
          >
            {server?.name} is added, but this app does not talk to a server yet. Channels
            and messages arrive with the socket.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
