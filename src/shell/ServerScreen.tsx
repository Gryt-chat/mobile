import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Button, Dialog, Spinner, useTheme } from "@gryt/ui-native";
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
        <Spinner color={theme.color.muted} />
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
  const byId = new Map(channels.map((c) => [c.id, c]));

  /**
   * The voice channel you have tapped but not yet agreed to join.
   *
   * Here rather than on the shell: nothing outside this list needs to know
   * about a question that has not been answered, and the answer is what the
   * shell already has a field for.
   */
  const [pending, setPending] = useState<Channel | null>(null);

  /* Read out here, on this side of the portal. A dialog's body is rendered in
   * a different React tree and context does not cross it — `useShell` inside
   * one throws from a component that visibly is inside a provider. */
  const { setVoiceChannel } = useShell();

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
           behind it unless the list reserves the room itself. `TAB_BAR_SPACE`
           is measured from the bottom of the screen and already covers the
           safe area. */
        paddingBottom: theme.space(2) + TAB_BAR_SPACE,
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

        return <ChannelRow key={item.id} channel={channel} onAskToJoin={setPending} />;
      })}

      {/*
        A `Dialog` rather than an `AlertDialog`, which is the one that cannot be
        dismissed by tapping outside. That is the right shape for deleting a
        channel and the wrong one here: joining is not destructive, cancelling
        is the safe answer, and a tap on the scrim meaning "no" is what anybody
        will try first.

        Driven by `open` rather than by a `Trigger`, because the thing that
        opens it is a row in a list and there is one dialog for all of them.
      */}
      <Dialog.Root
        open={pending !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setPending(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Join {pending?.name}?</Dialog.Title>
            <Dialog.Description>
              Your microphone starts as soon as you connect.
            </Dialog.Description>
            <Dialog.Footer>
              <Button tone="ghost" onPress={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                tone="primary"
                onPress={() => {
                  /* Read from state rather than from a closure over the row:
                   * the dialog is one component and the row that opened it has
                   * long since re-rendered. */
                  if (pending) setVoiceChannel(pending);
                  setPending(null);
                }}
              >
                Connect
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </ScrollView>
  );
}

function ChannelRow({
  channel,
  onAskToJoin,
}: {
  channel: Channel;
  /** Voice only. The row asks; it does not join. */
  onAskToJoin: (channel: Channel) => void;
}) {
  const theme = useTheme();
  const Icon = channel.type === "voice" ? SpeakerHighIcon : HashIcon;

  return (
    <Pressable
      onPress={() => {
        /* A voice channel is not somewhere you navigate to. Joining one has to
         * leave you where you are — the call outlives the screen, and a phone
         * that pushed a route for it would put the call behind a back button.
         *
         * It also does not happen on this press any more. A text channel opens
         * a screen you can back out of; a voice channel opens a microphone, and
         * on a phone the two rows are a thumb-width apart. */
        if (channel.type === "voice") {
          onAskToJoin(channel);
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
