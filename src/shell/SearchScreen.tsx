import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme } from "@gryt/ui-native";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";

import { useShell } from "./ShellContext";
import { ServerIcon } from "../servers/ServerIcon";

/**
 * Search, across every server rather than the active one. One day. Nothing here can be
 * operated on purpose: a control that responds without acting costs trust in the rest.
 */
export function SearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { servers } = useShell();

  /* Reachable with nothing joined, now that the navbar is always there. */
  const nothingToSearch = servers.length === 0;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.bg,
        paddingTop: insets.top,
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space(3),
        paddingHorizontal: theme.space(6),
      }}
    >
      <MagnifyingGlassIcon size={40} color={theme.color.muted} weight="bold" />

      <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>
        {nothingToSearch ? "Nothing to search yet" : "Search is not built yet"}
      </Text>

      <Text
        style={{
          color: theme.color.muted,
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
        }}
      >
        {nothingToSearch
          ? "Join a server and this will search across every one of them."
          : servers.length === 1
            ? "When it lands it will search your server."
            : `When it lands it will search all ${servers.length} of your servers at once.`}
      </Text>

      {nothingToSearch ? null : (
        <View style={{ flexDirection: "row", gap: theme.space(2), paddingTop: theme.space(2) }}>
          {servers.map((s) => (
            /* `ServerIcon`, not an Avatar. These are servers, and a circle is a person
               everywhere else — the rounded square keeps the two apart. */
            <ServerIcon key={s.host} host={s.host} name={s.name} size={28} />
          ))}
        </View>
      )}
    </View>
  );
}
