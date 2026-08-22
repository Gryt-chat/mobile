import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "../ui/Text";
import { Button, Dialog, Spinner, useTheme } from "@gryt/ui-native";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { PlugsIcon } from "phosphor-react-native/src/icons/Plugs";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";

import { LivePresence } from "./LivePresence";
import { MembersDrawer } from "./MembersDrawer";
import { ServerHeader } from "./ServerHeader";
import { TAB_BAR_SPACE } from "./TabBar";
import { useShell } from "./ShellContext";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { occupancy } from "../connection/presence";
import { useMembers } from "../connection/MembersProvider";
import { NoServers } from "../servers/NoServers";
import type { Channel, ConnectionState, SidebarItem } from "../connection/types";

/**
 * The Server tab: the header, what is happening in voice, and the channels.
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
 *
 * Dropping the header dropped Discovery with it, though — the switcher is the
 * only thing that links to `/discovery`, and the header is the only thing that
 * opens the switcher. So the empty state carries that link itself.
 *
 * The members drawer is opened from here rather than from the header, because
 * it has to survive the header being replaced by the status screen — the
 * `Drawer` mounts a modal, and unmounting one mid-dismiss is how iOS ends up
 * with a scrim and no panel.
 */
export function ServerScreen() {
  const theme = useTheme();
  const { state } = useServerConnection();
  const { servers, setAddServerOpen, lan } = useShell();
  const [membersOpen, setMembersOpen] = useState(false);

  if (servers.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
        {/* Gated on `lan.available` the same way the switcher's Discovery row
            is, and readable without starting a browse: `available` is whether
            the module is in the build, not whether anything answered. */}
        <NoServers
          onAdd={() => setAddServerOpen(true)}
          onDiscover={lan.available ? () => router.push("/discovery") : undefined}
        />
      </View>
    );
  }

  const channels = state.status === "ready" ? state.channels : [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {/* Offered only once there is a list to draw. Before the join settles
          the member list is empty, and a button opening an empty panel is a
          button that lies about having an answer. */}
      <ServerHeader
        onOpenMembers={state.status === "ready" ? () => setMembersOpen(true) : undefined}
      />

      {state.status === "ready" ? (
        <ServerBody channels={state.channels} sidebar={state.sidebar} />
      ) : (
        <Status state={state} />
      )}

      <MembersDrawer
        open={membersOpen}
        onOpenChange={setMembersOpen}
        channels={channels}
      />
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
 * What is live, then the sidebar order rendered flat.
 *
 * `sidebar_items` is the real ordering and a `separator` is a heading rather
 * than a container — it does not hold the channels after it. So this sorts by
 * position and renders linearly rather than building a tree that does not
 * exist. When the server sends no sidebar, the bare channel list is the
 * fallback, which is what the server itself falls back to.
 *
 * The live strip scrolls with the list rather than being pinned above it. It is
 * the top of the page, not a second bar: pinning it would cost the same height
 * on a server where nothing is happening as on one where everything is, which
 * is exactly what a strip that can be absent was chosen to avoid.
 *
 * The join question lives here rather than on either child, because both the
 * strip and the rows ask it and there is one dialog for all of them.
 */
function ServerBody({
  channels,
  sidebar,
}: {
  channels: Channel[];
  sidebar: SidebarItem[];
}) {
  const theme = useTheme();
  const { all } = useMembers();
  const byId = new Map(channels.map((c) => [c.id, c]));

  /**
   * The voice channel you have tapped but not yet agreed to join.
   *
   * Here rather than on the shell: nothing outside this screen needs to know
   * about a question that has not been answered, and the answer is what the
   * shell already has a field for.
   */
  const [pending, setPending] = useState<Channel | null>(null);

  /* Read out here, on this side of the portal. A dialog's body is rendered in
   * a different React tree and context does not cross it — `useShell` inside
   * one throws from a component that visibly is inside a provider. */
  const { setVoiceChannel } = useShell();

  /* One pass over the member list for the whole screen, rather than one per
   * row. The list is short, but the row would be doing it on every render of
   * every channel for a number it could be handed. */
  const counts = occupancy(channels, all);

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
      <LivePresence channels={channels} onAskToJoin={setPending} />

      {rows.map((item) => {
        if (item.kind === "spacer") {
          return <View key={item.id} style={{ height: item.spacerHeight ?? theme.space(3) }} />;
        }

        if (item.kind === "separator") {
          return (
            <Text
              key={item.id}
              numberOfLines={1}
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

        return (
          <ChannelRow
            key={item.id}
            channel={channel}
            here={counts.get(channel.id) ?? 0}
            onAskToJoin={setPending}
          />
        );
      })}

      {/*
        A `Dialog` rather than an `AlertDialog`, which is the one that cannot be
        dismissed by tapping outside. That is the right shape for deleting a
        channel and the wrong one here: joining is not destructive, cancelling
        is the safe answer, and a tap on the scrim meaning "no" is what anybody
        will try first.

        Driven by `open` rather than by a `Trigger`, because the things that
        open it are a row in a list and a card in the strip.
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
  here,
  onAskToJoin,
}: {
  channel: Channel;
  /** How many people are in it. Voice only, and zero for an empty room. */
  here: number;
  /** Voice only. The row asks; it does not join. */
  onAskToJoin: (channel: Channel) => void;
}) {
  const theme = useTheme();
  const { voiceChannel } = useShell();
  const Icon = channel.type === "voice" ? SpeakerHighIcon : HashIcon;

  /* The room you are in, marked on the row as well as in the panel above.
   * Two places, because the panel scrolls away and the list is the index. */
  const inThisOne = channel.id === voiceChannel?.id;
  const tint = inThisOne ? theme.color.accent : theme.color.muted;

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
      accessibilityLabel={
        channel.type === "voice" && here > 0
          ? `${channel.name}, ${here === 1 ? "1 person" : `${here} people`} here`
          : channel.name
      }
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(4),
        backgroundColor: pressed
          ? theme.color.surfaceRaised
          : inThisOne
            ? theme.color.surface
            : "transparent",
      })}
    >
      <Icon
        size={20}
        color={tint}
        weight={channel.type === "voice" ? "fill" : "bold"}
      />
      {/* One line, always. A channel name is as long as whoever made it felt
          like, and a wrapped one does not read as a longer name — it reads as
          two rows, because the icon stays put on the first line and the second
          starts under it. `minWidth: 0` is what actually lets it truncate: a
          flex child's default minimum is its content, so without it the text
          pushes the count off the row rather than shortening. */}
      <Text
        numberOfLines={1}
        style={{
          color: inThisOne ? theme.color.accent : theme.color.text,
          fontSize: 17,
          fontWeight: "500",
          flex: 1,
          minWidth: 0,
        }}
      >
        {channel.name}
      </Text>

      {/* A count and no faces. The faces are in the strip, and drawing them
          twice would make the list the second-best copy of it. */}
      {here > 0 ? (
        <Text style={{ color: theme.color.muted, fontSize: 13 }}>{here}</Text>
      ) : null}
    </Pressable>
  );
}
