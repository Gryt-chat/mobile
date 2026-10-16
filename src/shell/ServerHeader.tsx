import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme } from "@gryt/ui-native";
import { UsersIcon } from "phosphor-react-native/src/icons/Users";

import { useShell } from "./ShellContext";
import { TourTarget } from "../onboarding/tourTargets";
import { ServerIcon } from "../servers/ServerIcon";
import { useServers } from "../servers/store";
import { useServerMenu } from "../servers/useServerMenu";
import { canOpenServerSettings } from "../servers/admin/sections";
import { useIdentityClaim } from "../identity/useIdentityClaim";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { canOnServer } from "../connection/permissions";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";

/**
 * The band at the top of the Server tab, drawn rather than a `UINavigationBar`. Painted
 * in the surface, with `paddingTop` from the safe area so it runs under the status bar.
 */
export function ServerHeader({ onOpenMembers }: { onOpenMembers?: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { server, setSwitcherOpen } = useShell();
  /* `server` is null only on the "no servers" screen, which does not draw this
   * header — the placeholder keeps the hook unconditional. */
  const { leave } = useServers();
  /* Offered on the header and not in the switcher, because agreeing works by dropping
   * the session and rejoining the server you are looking at (GRYT-502). */
  const { canClaim, claim } = useIdentityClaim(server?.host ?? null);
  /* Templates are server-wide policy and the screen talks to this connection.
   * `canOnServer` says yes on an older server, so it is refused rather than hidden. */
  const { state, online } = useServerConnection();
  const canManageRoles = canOnServer(
    state.status === "ready" ? state.details : undefined,
    "manage_roles",
  );
  /* `view_bans` rather than `ban_members`: seeing the list and lifting a ban are
   * separate, and gating on the stronger one hides the list from readers. */
  const canViewBans = canOnServer(
    state.status === "ready" ? state.details : undefined,
    "view_bans",
  );
  const canOpenSettings = canOpenServerSettings(
    state.status === "ready" ? state.details : undefined,
  );
  const menu = useServerMenu({
    server: server ?? { host: "", name: "" },
    onLeave: () => server && void leave(server.host),
    onClaim: canClaim ? () => void claim() : undefined,
    onPermissions: canManageRoles ? () => router.push("/permissions") : undefined,
    onBans: canViewBans ? () => router.push("/bans") : undefined,
    onServerSettings: canOpenSettings ? () => router.push("/server-settings") : undefined,
  });

  // A server added by address and never reached has no name yet; the address stands in.
  const title = server?.name || server?.host || "No server";

  /* Why the server isn't usable, under its name (P13, P14). A reconnect stays
     `ready` with the old channels, so `online` is what says it dropped. */
  const line =
    state.status === "error"
      ? { text: state.code ? "Couldn’t join" : "Can’t reach it", colour: theme.scales.warning[8] }
      : state.status === "ready" && !online
        ? { text: "Reconnecting…", colour: theme.scales.warning[8] }
        : state.status === "connecting" || state.status === "joining"
          ? { text: "Connecting…", colour: theme.color.muted }
          : null;

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
      <TourTarget id="server-switcher" style={{ flex: 1 }}>
      <Pressable
        onPress={() => setSwitcherOpen(true)}
        onLongPress={server ? menu : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${title}. Switch server, or hold for more`}
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
        <ServerIcon
          host={server?.host ?? ""}
          name={server?.name ?? "?"}
          size={36}
          style={state.status === "error" ? { opacity: 0.6 } : undefined}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 22, fontWeight: "800", flexShrink: 1 }}>
              {title}
            </Text>
            {/* Says the name opens something; nothing else did (GRYT-1773). */}
            <CaretDownIcon size={18} weight="bold" color={theme.color.muted} />
          </View>
          {line ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: line.colour }} />
              <Text numberOfLines={1} style={{ color: line.colour, fontSize: 13, fontWeight: "500" }}>
                {line.text}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      </TourTarget>

      {/* Faded rather than gone while there's no list, so the header keeps its shape. */}
      {server ? (
        <Pressable
          onPress={onOpenMembers}
          disabled={!onOpenMembers}
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
            opacity: onOpenMembers ? 1 : 0.35,
          })}
        >
          <UsersIcon size={21} color={theme.color.muted} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}
