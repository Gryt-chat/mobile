import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useGlobalSearchParams } from "expo-router";
import { useTwoPane } from "./twoPane";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Spinner, Text, useTheme, useToast } from "@gryt/ui-native";
import { Dialog } from "../ui/Dialog";
import { ArrowClockwiseIcon } from "phosphor-react-native/src/icons/ArrowClockwise";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { ChatsTeardropIcon } from "phosphor-react-native/src/icons/ChatsTeardrop";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { KeyboardIcon } from "phosphor-react-native/src/icons/Keyboard";
import { PlugsIcon } from "phosphor-react-native/src/icons/Plugs";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { RobotIcon } from "phosphor-react-native/src/icons/Robot";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";

import { Faces } from "./Faces";
import { LivePresence } from "./LivePresence";
import { MembersDrawer } from "./MembersDrawer";
import { useCanStartDm, useOpenDm } from "./openDm";
import { ServerHeader } from "./ServerHeader";
import { flattenSidebar, folderRollups, sidebarBlocks } from "./sidebarTree";
import { useTabBarSpace } from "./TabBar";
import { useShell } from "./ShellContext";
import { lanDiscoveryAvailable } from "../../modules/lan-discovery";
import { UnreadPill } from "./UnreadPill";
import { useGrytAccount } from "../account/AccountProvider";
import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import { occupiedRooms, whoIsThere } from "../connection/presence";
import { canInChannel, canOnServer } from "../connection/permissions";
import { readConversation, useUnread } from "../connection/unread";
import { inheritedChannelLevel } from "../notify/notificationPrefs";
import { pickNotificationLevel } from "../preferences/pickNotificationLevel";
import { threadUnreadIn, useThreadUnread } from "../threads/threadUnread";
import { useActionSheet } from "../ui/actionSheet";
import { useMembers } from "../connection/MembersProvider";
import { NoServers } from "../servers/NoServers";
import type { Channel, ConnectionState, Member, SidebarItem } from "../connection/types";

/**
 * The Server tab: the header, what is happening in voice, and the channels.
 * **Having no servers is a state of this tab, not a different app.**
 */

export function ServerScreen() {
  const theme = useTheme();
  const { state, me, online } = useServerConnection();
  const openDmWith = useOpenDm();

  const { servers, setAddServerOpen } = useShell();
  const [membersOpen, setMembersOpen] = useState(false);
  const canStartDm = useCanStartDm();

  if (servers.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
        {/* Gated on `lanDiscoveryAvailable` the same way the switcher's Discovery row
            is, and readable without starting a browse: `available` is whether
            the module is in the build, not whether anything answered. */}
        <NoServers
          onAdd={() => setAddServerOpen(true)}
          onDiscover={lanDiscoveryAvailable ? () => router.push("/discovery") : undefined}
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
        <ServerBody
          channels={state.channels}
          sidebar={state.sidebar}
          offline={!online}
        />
      ) : (
        <Status state={state} />
      )}

      <MembersDrawer
        open={membersOpen}
        onOpenChange={setMembersOpen}
        channels={channels}
        me={me?.serverUserId ?? null}
        /* Without this the row is not pressable at all, which is the whole gate.
           The server refuses `dm:open` either way. */
        onMessage={
          canStartDm
            ? (member) => {
                setMembersOpen(false);
                openDmWith(member.serverUserId);
              }
            : undefined
        }
      />
    </View>
  );
}

function Status({ state }: { state: ConnectionState }) {
  const theme = useTheme();
  const { state: account, signIn } = useGrytAccount();
  const { rejoin, reconnect } = useServerConnection();
  const { server, setSwitcherOpen } = useShell();
  const tabBarSpace = useTabBarSpace();
  const [trying, setTrying] = useState(false);

  // Long enough to read as an attempt; the header line changes once it lands.
  useEffect(() => {
    if (!trying) return;
    const t = setTimeout(() => setTrying(false), 1500);
    return () => clearTimeout(t);
  }, [trying]);

  /* The phone's own refusal and the server's both mean the join went without an
   * account. Signing in fixes that, so the card offers it (GRYT-1292). */
  const needsAccount =
    state.status === "error" &&
    (state.code === "account_required" || state.code === "identity_tier_refused");
  const signingIn = account.status === "signingIn";
  const signedIn = account.status === "signedIn";

  /* The same join again with the account, once. On the change to signed in only,
   * or a refusal that survives the account would rejoin forever. */
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    const was = wasSignedIn.current;
    wasSignedIn.current = signedIn;
    if (signedIn && !was && needsAccount) void rejoin();
  }, [signedIn, needsAccount, rejoin]);

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

  /* P13: a server that isn't answering, or refused the join. Try again, or go elsewhere. */
  if (state.status === "error" && !needsAccount) {
    const name = server?.name || server?.host || "This server";
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space(3), paddingHorizontal: theme.space(8), paddingBottom: tabBarSpace }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.color.surface, alignItems: "center", justifyContent: "center" }}>
          <PlugsIcon size={28} color={theme.color.muted} />
        </View>
        <Text style={{ color: theme.color.text, fontSize: 19, fontWeight: "700", textAlign: "center", marginTop: theme.space(1) }}>
          {state.code ? `Couldn’t join ${name}` : `${name} isn’t answering`}
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21, textAlign: "center" }}>{state.message}</Text>
        <View style={{ flexDirection: "row", gap: theme.space(2.5), marginTop: theme.space(2) }}>
          <Button
            tone="primary"
            onPress={() => {
              if (trying) return;
              setTrying(true);
              reconnect();
            }}
            startIcon={trying ? <Spinner color={theme.color.onAccent} /> : <ArrowClockwiseIcon size={17} color={theme.color.onAccent} weight="bold" />}
          >
            Try now
          </Button>
          <Button tone="neutral" onPress={() => setSwitcherOpen(true)}>Switch server</Button>
        </View>
        {server?.name ? <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: theme.space(2) }}>{server.host}</Text> : null}
      </View>
    );
  }

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
      {!!working && (
        <Spinner color={theme.color.muted} />
      )}
      {!working && !!body.danger && (
        <ShieldWarningIcon size={36} color={theme.color.danger} weight="fill" />
      )}
      {!working && !body.danger && (
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

      {needsAccount ? (
        <Button tone="primary" size="large" disabled={signingIn} onPress={() => void signIn()}>
          {signingIn ? "Opening the browser…" : "Sign in to join"}
        </Button>
      ) : null}
    </View>
  );
}

/**
 * What is live, then the sidebar order rendered flat. **A `separator` is a
 * heading, not a container**, so this sorts by position rather than nesting.
 */
function ServerBody({
  channels,
  sidebar,
  offline = false,
}: {
  channels: Channel[];
  sidebar: SidebarItem[];
  /** Reconnecting: still `ready`, but nothing on screen is live. */
  offline?: boolean;
}) {
  const tabBarSpace = useTabBarSpace();
  const theme = useTheme();
  const { all } = useMembers();
  const byId = new Map(channels.map((c) => [c.id, c]));

  /* Where this person has been named and not read it. Per channel, because the
   * server records when a mention was seen. */
  const { server } = useShell();
  const { mentions } = useConnections();
  const mentionCounts = (server && mentions[server.host]) || {};
  const unreadAll = useUnread();
  const unreadCounts = (server && unreadAll[server.host]) || {};
  // A channel's badge adds in the replies in its threads, as the desktop's does.
  const threadUnread = useThreadUnread();

  /**
   * The voice channel you have tapped but not yet agreed to join. Here rather
   * than on the shell, which already has a field for the answer.
   */
  const [pending, setPending] = useState<Channel | null>(null);

  /* The room's answer, so a channel allow counts. The server refuses too, but this says why. */
  const { state } = useServerConnection();
  const details = state.status === "ready" ? state.details : undefined;
  const toast = useToast();
  const askToJoin = (channel: Channel) => {
    if (canInChannel(channel, (p) => canOnServer(details, p), "join_voice")) {
      setPending(channel);
      return;
    }
    toast.show({ title: `You can't join ${channel.name}`, description: "You don't have permission to join voice here." });
  };

  /* Read out here, on this side of the portal: a dialog's body is a different
   * React tree and context does not cross it. */
  const { setVoiceChannel } = useShell();

  /* One pass over the member list for the whole screen, rather than one per row
   * on every render of every channel. */
  const rooms = new Map(occupiedRooms(channels, all).map((r) => [r.channel.id, r.members]));

  /*
   * Which folders are shut, per server, on this phone — a view preference rather
   * than anything the server holds. Loaded after the first paint.
   */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const collapseKey = server ? `gryt.sidebarCollapsed.${server.host}` : null;

  useEffect(() => {
    if (!collapseKey) return;
    let cancelled = false;
    void AsyncStorage.getItem(collapseKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCollapsed(new Set(parsed.filter((s): s is string => typeof s === "string")));
        }
      })
      .catch(() => {
        /* Unreadable is the same as nothing collapsed, which shows more
           channels rather than fewer. */
      });
    return () => { cancelled = true; };
  }, [collapseKey]);

  const toggleFolder = (folderId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      if (collapseKey) {
        void AsyncStorage.setItem(collapseKey, JSON.stringify([...next])).catch(() => {
          // Losing it costs a folder being open next time.
        });
      }
      return next;
    });
  };

  const items: SidebarItem[] =
    sidebar.length > 0
      ? sidebar
      : channels.map<SidebarItem>((c) => ({
          id: c.id,
          kind: "channel",
          channelId: c.id,
        }));

  /* An older server sends every folder, even one whose channels are all hidden
   * from this person. Editors keep it, to have somewhere to put a channel (GRYT-1305). */
  const { state: connection } = useServerConnection();
  const canManageChannels = canOnServer(
    connection.status === "ready" ? connection.details : undefined,
    "manage_channels",
  );
  const rows = flattenSidebar(items, collapsed, { hideEmptyFolders: !canManageChannels });
  const rollups = folderRollups(items, mentionCounts);

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
        /* The bar floats over this list, so the last channel is behind it unless
           the list reserves the room. `useTabBarSpace` covers the safe area. */
        paddingBottom: theme.space(2) + tabBarSpace,
      }}
    >
      {/* P14: a dropped connection keeps the list, dimmed, until the socket is back. */}
      <View style={{ opacity: offline ? 0.45 : 1 }}>
      <LivePresence channels={channels} onAskToJoin={askToJoin} />

      {sidebarBlocks(rows).map((block) => {
        if (block.kind === "card") {
          return (
            <View
              key={block.rows[0].id}
              style={{
                marginHorizontal: theme.space(4),
                marginTop: theme.space(2),
                borderRadius: theme.radius.lg,
                backgroundColor: theme.color.surface,
                borderWidth: 1,
                borderColor: theme.color.border,
                overflow: "hidden",
              }}
            >
              {block.rows.map((item, index) => {
                const channel = item.channelId ? byId.get(item.channelId) : undefined;
                if (!channel) return null;
                return (
                  <ChannelRow
                    key={item.id}
                    channel={channel}
                    here={rooms.get(channel.id) ?? []}
                    mentions={mentionCounts[channel.id] ?? 0}
                    unread={(unreadCounts[channel.id] ?? 0) + (server ? threadUnreadIn(threadUnread, server.host, channel.id) : 0)}
                    last={index === block.rows.length - 1}
                    onAskToJoin={askToJoin}
                  />
                );
              })}
            </View>
          );
        }

        const { item } = block;
        if (item.kind === "spacer") {
          return <View key={item.id} style={{ height: item.spacerHeight ?? theme.space(3) }} />;
        }

        const folder = item.kind === "folder";
        const shut = collapsed.has(item.id);
        const inside = rollups.get(item.id);
        const Caret = shut ? CaretRightIcon : CaretDownIcon;

        return (
          <Pressable
            key={item.id}
            onPress={folder ? () => toggleFolder(item.id) : undefined}
            disabled={!folder}
            accessibilityRole={folder ? "button" : "header"}
            accessibilityState={folder ? { expanded: !shut } : undefined}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(2),
              paddingHorizontal: theme.space(7),
              paddingTop: theme.space(4),
              paddingBottom: theme.space(0.5),
            }}
          >
            <Text numberOfLines={1} style={{ flexShrink: 1, color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>
              {item.label ?? (folder ? "Folder" : "")}
            </Text>
            {/* Only while shut. Open, each channel carries its own pill. */}
            {shut && inside?.mentions ? <UnreadPill count={inside.mentions} /> : null}
            {folder ? (
              <View style={{ marginLeft: "auto" }}>
                <Caret size={16} color={theme.color.muted} weight="bold" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      </View>
      {offline ? (
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19, marginHorizontal: theme.space(6.5), marginTop: theme.space(3.5) }}>
          The connection dropped a moment ago. The channels stay as they were until it&rsquo;s back.
        </Text>
      ) : null}

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
              Your microphone starts as soon as you connect.{whoIsThere(pending ? rooms.get(pending.id) : undefined)}
            </Dialog.Description>
            <Dialog.Footer>
              <Button tone="ghost" onPress={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                tone="primary"
                onPress={() => {
                  /* Read from state rather than a closure over the row: the
                   * dialog is one component and the row has re-rendered. */
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

/**
 * Whether this account may point a channel at a permission scope.
 * **`manage_channels`, not `manage_roles`** — that is what the server gates on.
 */
function useCanManageChannels(): boolean {
  const { state } = useServerConnection();
  return canOnServer(state.status === "ready" ? state.details : undefined, "manage_channels");
}

function ChannelRow({
  channel,
  here,
  mentions,
  unread,
  last,
  onAskToJoin,
}: {
  channel: Channel;
  /** Who is in it. Voice only, and empty for an empty room. */
  here: Member[];
  /** How many times this person has been named here and not read it. */
  mentions: number;
  /** Messages here nobody has read since this phone connected. */
  unread: number;
  /** The card's last row draws no rule under it. */
  last: boolean;
  /** Voice only. The row asks; it does not join. */
  onAskToJoin: (channel: Channel) => void;
}) {
  const theme = useTheme();
  const { voiceChannel, server } = useShell();
  const host = server?.host;
  const twoPane = useTwoPane();
  const { id: openId } = useGlobalSearchParams<{ id?: string }>();
  const open = twoPane && openId === channel.id;
  let TextIcon = channel.layout === "forum" ? ChatsTeardropIcon : HashIcon;
  if (channel.automated) TextIcon = RobotIcon;
  const Icon = channel.type === "voice" ? SpeakerHighIcon : TextIcon;
  const canManageChannels = useCanManageChannels();
  const present = useActionSheet();
  const { socket } = useServerConnection();

  /**
   * Hold a channel to read it, decide who can use it, or set its notification
   * level (GRYT-1534). The platform's own menu, so it stacks over the drawer.
   */
  const openMenu = () => {
    const options = [
      ...(unread + mentions > 0 ? ["Mark as read"] : []),
      ...(canManageChannels ? ["Channel permissions"] : []),
      "Notifications",
      "Cancel",
    ];
    void present({
      title: channel.name,
      options,
      cancelButtonIndex: options.length - 1,
    }).then((index) => {
      if (options[index] === "Mark as read") {
        if (host) readConversation(socket, host, channel.id);
      } else if (options[index] === "Channel permissions") {
        router.push({
          pathname: "/channel-permissions",
          params: { id: channel.id, name: channel.name },
        });
      } else if (options[index] === "Notifications" && host) {
        pickNotificationLevel(
          present,
          host,
          { kind: "channel", id: channel.id },
          "Notifications",
          channel.name,
          inheritedChannelLevel(host, channel),
        );
      }
    });
  };

  /* The room you are in, marked on the row as well as in the panel above.
   * Two places, because the panel scrolls away and the list is the index. */
  const inThisOne = channel.id === voiceChannel?.id;

  const loud = unread + mentions > 0;
  let iconColor = loud ? theme.color.text : theme.color.muted;
  if (inThisOne) iconColor = theme.color.onAccent;

  return (
    <Pressable
      onPress={() => {
        /* A voice channel is not somewhere you navigate to: joining leaves you where you are. */
        if (channel.type === "voice") {
          onAskToJoin(channel);
          return;
        }
        if (open) return;
        // Beside the list a channel swaps in place, so switching doesn't pile up a stack.
        (twoPane ? router.replace : router.push)({ pathname: "/channel/[id]", params: { id: channel.id } });
      }}
      onLongPress={openMenu}
      accessibilityRole="button"
      accessibilityLabel={
        channel.type === "voice" && here.length > 0
          ? `${channel.name}, ${here.length === 1 ? "1 person" : `${here.length} people`} here`
          : channel.name
      }
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingLeft: theme.space(3.5),
        backgroundColor: pressed || inThisOne || open ? theme.color.surfaceHover : "transparent",
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: inThisOne ? theme.color.accent : theme.color.surfaceRaised,
        }}
      >
        <Icon
          size={17}
          color={iconColor}
          weight={channel.type === "voice" || channel.layout === "forum" ? "fill" : "bold"}
        />
      </View>
      <View
        style={{
          flex: 1,
          minHeight: 52,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          paddingRight: theme.space(3.5),
          borderBottomWidth: last ? 0 : 1,
          borderColor: theme.color.border,
        }}
      >
        {/* One line: a wrapped name reads as two rows. `minWidth: 0` is what lets it truncate. */}
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 16, fontWeight: loud || inThisOne ? "700" : "500", flex: 1, minWidth: 0 }}
        >
          {channel.name}
        </Text>
        {channel.requirePushToTalk ? (
          <KeyboardIcon size={15} color={theme.color.muted} weight="fill" />
        ) : null}
        {here.length > 0 ? <Faces members={here} size={22} limit={3} ground={theme.color.surface} /> : null}
        <UnreadPill count={unread} mentions={mentions} />
      </View>
    </Pressable>
  );
}

