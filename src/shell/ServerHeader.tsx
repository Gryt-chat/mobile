import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme } from "@gryt/ui-native";
import { UsersIcon } from "phosphor-react-native/src/icons/Users";

import { useShell } from "./ShellContext";
import { ServerIcon } from "../servers/ServerIcon";
import { useServers } from "../servers/store";
import { useServerMenu } from "../servers/useServerMenu";
import { useIdentityClaim } from "../identity/useIdentityClaim";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { canOnServer } from "../connection/permissions";

/**
 * The band at the top of the Server tab, drawn rather than a `UINavigationBar`
 * because a native bar would have to be lied to about its title and its right
 * item at once.
 *
 * Painted in the surface rather than the server's own colour: `/info` sends a
 * name, a description and an icon, and no palette (GRYT-407).
 *
 * The name opens the switcher and holds for the server's menu. The members
 * button at the right end is the only door to the drawer — the edge swipe works
 * too, and a gesture with nothing pointing at it is a feature nobody finds.
 *
 * `paddingTop` from the safe area rather than a `SafeAreaView`, so the colour
 * runs under the status bar instead of leaving a black band above it.
 */
export function ServerHeader({ onOpenMembers }: { onOpenMembers?: () => void }) {
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
  /* Templates are server-wide policy, and the screen talks to the connection
   * this header belongs to — so it is offered here rather than in the
   * switcher, the same as claiming a membership. `canOnServer` says yes on a
   * server that has never heard of `manage_roles`, so this stays offered
   * against a build older than the permission and is refused there instead of
   * hidden. */
  const { state } = useServerConnection();
  const canManageRoles = canOnServer(
    state.status === "ready" ? state.details : undefined,
    "manage_roles",
  );
  /* `view_bans` rather than `ban_members`: seeing the list and lifting a ban
   * are separate permissions on the server, and the screen honours the split
   * by hiding Unban. Gating the entry on the stronger one would hide the list
   * from everybody who may only read it. */
  const canViewBans = canOnServer(
    state.status === "ready" ? state.details : undefined,
    "view_bans",
  );
  const menu = useServerMenu({
    server: server ?? { host: "", name: "" },
    onLeave: () => server && void leave(server.host),
    onClaim: canClaim ? () => void claim() : undefined,
    onPermissions: canManageRoles ? () => router.push("/permissions") : undefined,
    onBans: canViewBans ? () => router.push("/bans") : undefined,
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

      {onOpenMembers ? (
        <Pressable
          onPress={onOpenMembers}
          accessibilityRole="button"
          accessibilityLabel="Who's about"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
          })}
        >
          <UsersIcon size={21} color={theme.color.muted} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}
