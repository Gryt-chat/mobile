import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";

import { useShell } from "./ShellContext";
import { ServerIcon } from "../servers/ServerIcon";

/**
 * Search, across every server rather than the active one. One day.
 *
 * **There is nothing on this screen you can operate, on purpose.** It had a
 * field you could type in and six filter chips you could toggle, and none of
 * the seven did anything — there is no search endpoint on the server, so the
 * field searched nothing and the filters narrowed nothing. A control that
 * responds to a press without doing anything is not a preview of a feature; it
 * costs a tap to find that out, and then it costs trust in the controls beside
 * it that do work.
 *
 * So this says what it is and shows what it would search. The field and the
 * chips come back with the endpoint, and the shape of the results is what
 * should decide whether that filter row was right anyway — putting the row in
 * first would have settled that by accident.
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
          : `When it lands it will search all ${servers.length} of your ${
              servers.length === 1 ? "server" : "servers"
            } at once.`}
      </Text>

      {nothingToSearch ? null : (
        <View style={{ flexDirection: "row", gap: theme.space(2), paddingTop: theme.space(2) }}>
          {servers.map((s) => (
            /* `ServerIcon`, not an Avatar. These are servers, and a circle is a
               person everywhere else in this app — the rounded square is what
               keeps the two apart. It was `Avatar` with initials, which was
               both the wrong shape and the letter tile the client's avatar rule
               exists to avoid. */
            <ServerIcon key={s.host} host={s.host} name={s.name} size={28} />
          ))}
        </View>
      )}
    </View>
  );
}
