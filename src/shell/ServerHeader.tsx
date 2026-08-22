import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";

import { useShell } from "./ShellContext";
import { ServerIcon } from "../servers/ServerIcon";
import { useServers } from "../servers/store";
import { useServerMenu } from "../servers/useServerMenu";
import { useIdentityClaim } from "../identity/useIdentityClaim";

/**
 * The band at the top of the Server tab.
 *
 * Drawn rather than a `UINavigationBar` because a native bar would have to be
 * lied to about its title and its right item at once.
 *
 * It used to be painted in the server's own colour, which is the one piece of
 * chrome that says which server you are in without being read. A real server
 * has no colour to paint with — `/info` sends a name, a description and an
 * icon, and no palette — so it is the surface until the icon is wired and there
 * is something to take a colour from. GRYT-407.
 *
 * One target: the name, which opens the server switcher rather than navigating,
 * and holds for the server's own menu.
 *
 * There used to be a caret at the right end of it, and it was the one part of
 * the row that looked like it did something the rest of the row did not. It did
 * not — the whole row opens the switcher. The long press is a thing the caret
 * never pointed at, so it is not a replacement for it either; the caret was
 * just wrong.
 *
 * There used to be an avatar at the right end opening the "you" sheet, and this
 * comment used to say the reference put it here, the brief put it in the navbar,
 * and it was reachable from both until one of those was settled. Settled: the
 * navbar. Two doors to one sheet is one more than the sheet needs, and the tab
 * bar is the one people already look at.
 *
 * `paddingTop` from the safe area rather than a `SafeAreaView`, so the colour
 * runs under the status bar instead of leaving a black band above it.
 */
export function ServerHeader() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { server, setSwitcherOpen } = useShell();
  /* `server` is null only on the "no servers" screen, which does not draw this
   * header — the placeholder keeps the hook unconditional. */
  const { leave } = useServers();
  /* Offered on the header and not in the switcher, because agreeing has to
   * take effect: it works by dropping the session and rejoining, and the only
   * connection there is belongs to the server you are looking at. GRYT-502. */
  const { canClaim, claim } = useIdentityClaim(server?.host ?? null);
  const menu = useServerMenu({
    server: server ?? { host: "", name: "" },
    onLeave: () => server && void leave(server.host),
    onClaim: canClaim ? () => void claim() : undefined,
  });

  return (
    <View
      style={{
        backgroundColor: theme.color.surface,
        paddingTop: insets.top + theme.space(1),
        paddingBottom: theme.space(3),
        paddingHorizontal: theme.space(3),
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        borderBottomWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      <Pressable
        onPress={() => setSwitcherOpen(true)}
        onLongPress={server ? menu : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${server?.name ?? "No server"}. Switch server, or hold for more`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          flex: 1,
          padding: theme.space(1),
          borderRadius: theme.radius.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <ServerIcon host={server?.host ?? ""} name={server?.name ?? "?"} size={36} />
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 22, fontWeight: "800", flex: 1 }}
        >
          {server?.name ?? "No server"}
        </Text>
      </Pressable>
    </View>
  );
}
