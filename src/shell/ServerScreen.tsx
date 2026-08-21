import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { PlugsIcon } from "phosphor-react-native/src/icons/Plugs";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";

import { ServerHeader } from "./ServerHeader";
import { TAB_BAR_SPACE } from "./TabBar";
import { useShell } from "./ShellContext";
import { useServerConnection } from "../connection/ConnectionProvider";
import { NoServers } from "../servers/NoServers";
import type { Channel, ConnectionState, SidebarItem } from "../connection/types";

/**
 * The Server tab: the header, and the channels the server actually sends.
 *
 * Nothing here is fake any more. The list arrives on `server:details`, which
 * only answers a socket that has completed the join — so everything on this
 * screen is downstream of the handshake having worked.
 *
 * Having no servers at all is a state of this tab rather than a different app.
 * It used to replace the whole screen, navbar included, which put signing in and
 * settings out of reach for exactly the person most likely to need them. The
 * header goes with it: there is no server to name, and a switcher listing
 * nothing is a door to an empty room.
 */
export function ServerScreen() {
  const theme = useTheme();
  const { state } = useServerConnection();
  const { servers, setAddServerOpen } = useShell();

  if (servers.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
        <NoServers onAdd={() => setAddServerOpen(true)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ServerHeader />

      {state.status === "ready" ? (
        <ChannelList channels={state.channels} sidebar={state.sidebar} />
      ) : (
        <Status state={state} />
      )}
    </View>
  );
}

function Status({ state }: { state: ConnectionState }) {
  const theme = useTheme();

  const body = (() => {
    switch (state.status) {
      case "connecting":
        return { title: "Connecting", detail: "Opening a socket to the server." };
      case "joining":
        return { title: "Joining", detail: "Proving who you are, and asking to be let in." };
      case "refused":
        return {
          title: "This is not the same server",
          detail: state.detail,
          danger: true,
        };
      case "error":
        return { title: "Could not join", detail: state.message };
      default:
        return { title: "Not connected", detail: "No server selected." };
    }
  })();

  const working = state.status === "connecting" || state.status === "joining";

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.space(8),
        gap: theme.space(3),
      }}
    >
      {working ? (
        <ActivityIndicator color={theme.color.muted} />
      ) : body.danger ? (
        <ShieldWarningIcon size={36} color={theme.color.danger} weight="fill" />
      ) : (
        <PlugsIcon size={36} color={theme.color.muted} />
      )}

      <Text
        style={{
          color: body.danger ? theme.color.danger : theme.color.text,
          fontSize: 18,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {body.title}
      </Text>
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 15,
          lineHeight: 21,
          textAlign: "center",
        }}
      >
        {body.detail}
      </Text>
    </View>
  );
}

/**
 * The sidebar order, rendered flat.
 *
 * `sidebar_items` is the real ordering and a `separator` is a heading rather
 * than a container — it does not hold the channels after it. So this sorts by
 * position and renders linearly rather than building a tree that does not
 * exist. When the server sends no sidebar, the bare channel list is the
 * fallback, which is what the server itself falls back to.
 */
function ChannelList({
  channels,
  sidebar,
}: {
  channels: Channel[];
  sidebar: SidebarItem[];
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const byId = new Map(channels.map((c) => [c.id, c]));

  const rows =
    sidebar.length > 0
      ? [...sidebar].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      : channels.map<SidebarItem>((c) => ({
          id: c.id,
          kind: "channel",
          channelId: c.id,
        }));

  if (channels.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(8) }}>
        <Text style={{ color: theme.color.muted, fontSize: 15, textAlign: "center" }}>
          This server has no channels yet.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: theme.space(2),
        /* The bar floats over this list, so the last channel in a long one is
           behind it unless the list reserves the room itself. */
        paddingBottom: theme.space(2) + insets.bottom + TAB_BAR_SPACE,
      }}
    >
      {rows.map((item) => {
        if (item.kind === "spacer") {
          return <View key={item.id} style={{ height: item.spacerHeight ?? theme.space(3) }} />;
        }

        if (item.kind === "separator") {
          return (
            <Text
              key={item.id}
              style={{
                color: theme.color.muted,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                paddingHorizontal: theme.space(4),
                paddingTop: theme.space(4),
                paddingBottom: theme.space(1),
              }}
            >
              {item.label ?? ""}
            </Text>
          );
        }

        const channel = item.channelId ? byId.get(item.channelId) : undefined;
        if (!channel) return null;

        return <ChannelRow key={item.id} channel={channel} />;
      })}
    </ScrollView>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
  const theme = useTheme();
  const { setVoiceChannel } = useShell();
  const Icon = channel.type === "voice" ? SpeakerHighIcon : HashIcon;

  return (
    <Pressable
      onPress={() => {
        /* A voice channel is not somewhere you navigate to. Joining one has to
         * leave you where you are — the call outlives the screen, and a phone
         * that pushed a route for it would put the call behind a back button. */
        if (channel.type === "voice") {
          setVoiceChannel(channel);
          return;
        }
        router.push({ pathname: "/channel/[id]", params: { id: channel.id } });
      }}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(4),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <Icon
        size={20}
        color={theme.color.muted}
        weight={channel.type === "voice" ? "fill" : "bold"}
      />
      <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "500", flex: 1 }}>
        {channel.name}
      </Text>
    </Pressable>
  );
}
