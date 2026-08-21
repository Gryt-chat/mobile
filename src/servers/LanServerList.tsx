import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";

import { ServerIcon } from "./ServerIcon";
import type { LanServersState } from "./useLanServers";

/**
 * "On your network": the Gryt servers that answered on this LAN.
 *
 * A picker rather than a joiner. Tapping a row fills the address field above
 * it and nothing else happens — the same `/info` lookup, the same card, the
 * same Add button as an address somebody typed. That is the point of putting
 * this inside the join sheet rather than giving it a screen: mDNS knows a name
 * and a port and nothing about who may join or whether an account is needed,
 * so a row here that said "Add" would be promising something it has not
 * asked about.
 *
 * Renders nothing at all where there is no module — Android, or a build that
 * has not picked it up — rather than an empty section explaining itself. There
 * is nothing to explain: typing an address still works everywhere.
 */
export function LanServerList({
  state,
  onPick,
}: {
  state: LanServersState;
  onPick: (address: string) => void;
}) {
  const theme = useTheme();

  if (!state.available) return null;

  return (
    <View style={{ gap: theme.space(2) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        <BroadcastIcon size={16} color={theme.color.muted} weight="fill" />
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 13,
            fontWeight: "700",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          On your network
        </Text>
        {state.searching ? (
          <ActivityIndicator size="small" color={theme.color.muted} />
        ) : null}
      </View>

      {state.blocked ? <Blocked /> : null}

      {!state.blocked && state.servers.length === 0 ? (
        <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 19 }}>
          {state.searching
            ? "Looking for servers advertising themselves here."
            : "Nothing is advertising itself on this network. A server only shows up here if it is discoverable."}
        </Text>
      ) : null}

      {state.servers.map((server) => (
        <Pressable
          key={server.address}
          disabled={server.joined}
          onPress={() => onPick(server.address)}
          accessibilityRole="button"
          accessibilityState={{ disabled: server.joined }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space(3),
            padding: theme.space(2),
            borderRadius: theme.radius.lg,
            backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
            opacity: server.joined ? 0.5 : 1,
          })}
        >
          <ServerIcon host={server.address} name={server.name} size={40} />

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
              {server.name}
            </Text>
            <Text style={{ color: theme.color.muted, fontSize: 13 }} numberOfLines={1}>
              {server.joined ? `${server.address} · already added` : server.address}
            </Text>
          </View>

          {server.joined ? null : (
            <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
          )}
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Local network access was refused.
 *
 * There is no second prompt on iOS — the answer is remembered and only
 * Settings changes it — so this is a way there rather than a retry that would
 * do nothing. `app-settings:` opens this app's own page, which is where the
 * Local Network switch is.
 */
function Blocked() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => void Linking.openSettings()}
      accessibilityRole="button"
      style={({ pressed }) => ({
        padding: theme.space(3),
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
        gap: 4,
      })}
    >
      <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>
        Gryt cannot see your network
      </Text>
      <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 19 }}>
        Local network access is off, so servers here cannot be found. Turn it on in
        Settings — you can still add a server by address.
      </Text>
    </Pressable>
  );
}
