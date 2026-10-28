import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { AnchoredPopup, Button, Dialog, Spinner, Text, useTheme, useToast } from "@gryt/ui-native";
import { ArrowClockwiseIcon } from "phosphor-react-native/src/icons/ArrowClockwise";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { ChatsTeardropIcon } from "phosphor-react-native/src/icons/ChatsTeardrop";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { KeyboardIcon } from "phosphor-react-native/src/icons/Keyboard";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { PlugsIcon } from "phosphor-react-native/src/icons/Plugs";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";

import { Faces } from "./Faces";
import { LivePresence } from "./LivePresence";
import { FilteredSection } from "./FilteredSection";
import { FriendsSection } from "./FriendsSection";
import { GroupDialog } from "./GroupDialog";
import { MembersDrawer, StatusDot } from "./MembersDrawer";
import { NewMessageDialog } from "./NewMessageDialog";
import { useCanStartDm, useOpenDm } from "./openDm";
import { ServerHeader } from "./ServerHeader";
import { flattenSidebar, folderRollups, sidebarBlocks } from "./sidebarTree";
import { useTabBarSpace } from "./TabBar";
import { useShell } from "./ShellContext";
import { lanDiscoveryAvailable } from "../../modules/lan-discovery";
import { UnreadPill } from "./UnreadPill";
import { useGrytAccount } from "../account/AccountProvider";
import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import { occupiedRooms } from "../connection/presence";
import { useCalls } from "../connection/CallsProvider";
import { useDirectMessages, type DirectConversation } from "../connection/DirectMessagesProvider";
import { conversationTitle } from "../connection/directMessages";
import {
  hideConversation,
  showConversation,
  splitHidden,
  useHiddenConversations,
} from "../connection/hiddenConversations";
import { canInChannel, canOnServer } from "../connection/permissions";
import { readConversation, useUnread } from "../connection/unread";
import { inheritedChannelLevel } from "../notify/notificationPrefs";
import { pickNotificationLevel } from "../preferences/pickNotificationLevel";
import { threadUnreadIn, useThreadUnread } from "../threads/threadUnread";
import { useActionSheet } from "../ui/actionSheet";
import { useMembers } from "../connection/MembersProvider";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { attachmentUrl, avatarSource } from "../chat/files";
import { eggAvatarSvg } from "@gryt/owl";
import { getServerHttpBase } from "../servers/address";
import { uploadGroupPicture } from "../connection/groupPicture";
import { NoServers } from "../servers/NoServers";
import type { Channel, ConnectionState, Member, SidebarItem } from "../connection/types";

/**
 * The Server tab: the header, what is happening in voice, and the channels.
 * **Having no servers is a state of this tab, not a different app.**
 */

export function ServerScreen() {
  const theme = useTheme();
  const { state, me, getAccessToken, online } = useServerConnection();
  const {
    updateGroup,
    addToGroup,
    leaveGroup,
  } = useDirectMessages();

  const openDmWith = useOpenDm();

  /** The group whose settings are open, or null. Starting one is the + dialog. */
  const [groupDialog, setGroupDialog] = useState<DirectConversation | null>(null);
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  /** Send a picture to this server and hand back the file id it stored. */
  const uploadGroupImage = async (uri: string, filename: string): Promise<string> => {
    const accessToken = await getAccessToken();
    const host = server?.host;
    if (!accessToken || !host) throw new Error("Not signed in to this server");

    return uploadGroupPicture(getServerHttpBase(host), accessToken, uri, filename);
  };

  const { servers, setAddServerOpen, server } = useShell();
  const [membersOpen, setMembersOpen] = useState(false);
  const canStartDm = useCanStartDm();
  const canGroup = canOnServer(state.status === "ready" ? state.details : undefined, "create_groups");

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
          onOpenGroupDialog={setGroupDialog}
          onNewMessage={canStartDm ? () => setNewMessageOpen(true) : undefined}
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

      <GroupDialog
        open={groupDialog !== null}
        onOpenChange={(next) => { if (!next) setGroupDialog(null); }}
        host={server?.host ?? null}
        me={me?.serverUserId ?? null}
        existing={groupDialog ?? undefined}
        canAdd={canGroup}
        uploadImage={uploadGroupImage}
        onUpdate={updateGroup}
        onAdd={addToGroup}
        onLeave={leaveGroup}
      />

      <NewMessageDialog
        open={newMessageOpen}
        onOpenChange={setNewMessageOpen}
        host={server?.host ?? null}
        me={me?.serverUserId ?? null}
        canGroup={canGroup}
        uploadImage={uploadGroupImage}
        onMessage={openDmWith}
        onOpenConversation={(id) => router.push({ pathname: "/messages/conversation/[id]", params: { id } })}
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
  onOpenGroupDialog,
  onNewMessage,
  offline = false,
}: {
  channels: Channel[];
  sidebar: SidebarItem[];
  onOpenGroupDialog: (conversation: DirectConversation) => void;
  /** The + beside Direct messages. Absent where this account can't start one. */
  onNewMessage?: () => void;
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
  const { me } = useServerConnection();

  /* Hidden is this device's answer, not the server's (GRYT-1379), so the
     split happens here rather than in the provider. */
  const { conversations } = useDirectMessages();
  const hiddenAt = useHiddenConversations(server?.host ?? null, me?.serverUserId ?? null);
  const { listed: visibleConversations, hidden: hiddenConversations, returned } = useMemo(
    () => splitHidden(conversations, hiddenAt),
    [conversations, hiddenAt],
  );

  /* A message brought these back, so the note that they were hidden is spent.
     In an effect: the split runs during a render and must not write. */
  useEffect(() => {
    if (!server?.host || !me?.serverUserId || returned.length === 0) return;
    for (const conversation of returned) {
      showConversation(server.host, me.serverUserId, conversation.conversation_id);
    }
  }, [returned, server?.host, me?.serverUserId]);
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

      <ConversationSection
        title="Direct messages"
        kind="dm"
        conversations={visibleConversations}
        host={server?.host ?? null}
        me={me?.serverUserId ?? null}
        onOpenGroupDialog={onOpenGroupDialog}
        onNew={onNewMessage}
      />
      <ConversationSection
        title="Groups"
        kind="group"
        conversations={visibleConversations}
        host={server?.host ?? null}
        me={me?.serverUserId ?? null}
        onOpenGroupDialog={onOpenGroupDialog}
      />

      {hiddenConversations.length > 0 ? (
        <HiddenConversationsSection
          conversations={hiddenConversations}
          host={server?.host ?? null}
          me={me?.serverUserId ?? null}
          onOpenGroupDialog={onOpenGroupDialog}
        />
      ) : null}

      <FriendsSection host={server?.host ?? null} />
      <FilteredSection host={server?.host ?? null} />
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
              Your microphone starts as soon as you connect.
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
  const TextIcon = channel.layout === "forum" ? ChatsTeardropIcon : HashIcon;
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
        router.push({ pathname: "/channel/[id]", params: { id: channel.id } });
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
        backgroundColor: pressed || inThisOne ? theme.color.surfaceHover : "transparent",
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

/**
 * The direct messages open on this server, under its channels — these belong to
 * this server. Nothing is drawn until there is one.
 */
function ConversationSection({
  title,
  kind,
  conversations: all,
  host,
  me,
  onOpenGroupDialog,
  onNew,
}: {
  title: string;
  kind: "dm" | "group";
  /** Not hidden. The Hidden group draws the rest, of either kind, on its own. */
  conversations: DirectConversation[];
  host: string | null;
  me: string | null;
  onOpenGroupDialog: (conversation: DirectConversation) => void;
  /** The + beside the heading, which keeps the heading up with nothing under it. */
  onNew?: () => void;
}) {
  const theme = useTheme();
  const conversations = all.filter((c) => (kind === "group" ? c.kind === "group" : c.kind !== "group"));

  if (conversations.length === 0 && !onNew) return null;

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: theme.space(4),
          paddingRight: theme.space(2),
          paddingTop: theme.space(4),
          paddingBottom: theme.space(1),
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: theme.color.muted,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            flex: 1,
          }}
        >
          {title}
        </Text>
        {onNew ? (
          <Pressable
            onPress={onNew}
            accessibilityRole="button"
            accessibilityLabel="New message"
            hitSlop={8}
            style={({ pressed }) => ({
              padding: theme.space(1),
              borderRadius: theme.radius.sm,
              backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
            })}
          >
            <PlusIcon size={16} color={theme.color.muted} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      {conversations.map((conversation) => (
        <DirectMessageRow
          key={conversation.conversation_id}
          conversation={conversation}
          host={host}
          me={me}
          onOpenGroupDialog={onOpenGroupDialog}
        />
      ))}
    </View>
  );
}

/**
 * Everything hidden on this server, of either kind, collapsed under one toggle.
 * The caller draws nothing at all while the list is empty.
 */
function HiddenConversationsSection({
  conversations,
  host,
  me,
  onOpenGroupDialog,
}: {
  conversations: DirectConversation[];
  host: string | null;
  me: string | null;
  onOpenGroupDialog: (conversation: DirectConversation) => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const Caret = expanded ? CaretDownIcon : CaretRightIcon;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Hidden, ${conversations.length} ${conversations.length === 1 ? "conversation" : "conversations"}`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          paddingLeft: theme.space(4),
          paddingRight: theme.space(2),
          paddingTop: theme.space(4),
          paddingBottom: theme.space(1),
          backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
        })}
      >
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Hidden
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 12 }}>{conversations.length}</Text>
        <Caret size={10} color={theme.color.muted} />
      </Pressable>

      {expanded
        ? conversations.map((conversation) => (
            <DirectMessageRow
              key={conversation.conversation_id}
              conversation={conversation}
              host={host}
              me={me}
              hidden
              onOpenGroupDialog={onOpenGroupDialog}
            />
          ))
        : null}
    </View>
  );
}

function DirectMessageRow({
  conversation,
  host,
  me,
  hidden = false,
  onOpenGroupDialog,
}: {
  conversation: DirectConversation;
  host: string | null;
  /** Your own id on this server, so hiding writes to the right device row. */
  me: string | null;
  /** Drawn under the Hidden group, so the menu offers Show instead of Hide. */
  hidden?: boolean;
  onOpenGroupDialog: (conversation: DirectConversation) => void;
}) {
  const theme = useTheme();
  const { byId } = useMembers();
  const { liveCalls } = useCalls();
  const toast = useToast();
  const { other } = conversation;

  /**
   * The long-press menu, anchored to the row. **`AnchoredPopup`, not `Menu`**: a
   * press here has to open the conversation, so there is no trigger to anchor to.
   */
  const rowRef = useRef<View>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  /* The same person the member list is drawing, when they are still here. A
     conversation outlives a membership, so a miss means no dot. */
  const member = byId.get(other.server_user_id);
  const isGroup = conversation.kind === "group";
  const title = conversationTitle(conversation);
  const uploaded =
    isGroup && host && conversation.icon_file_id
      ? attachmentUrl(host, conversation.icon_file_id)
      : null;

  /* Only when there is something to say. A grey mark on every quiet conversation
     is most of them, and a list of identical dots says nothing. */
  const around = !isGroup && member && member.status !== "offline";

  const id = conversation.conversation_id;
  const unreadAll = useUnread();
  const { mentions } = useConnections();
  const unread = (host && unreadAll[host]?.[id]) || 0;
  const named = (host && mentions[host]?.[id]) || 0;
  const { socket } = useServerConnection();

  return (
    <>
    <Pressable
      ref={rowRef}
      onPress={() => {
        /* On the Messages tab, wherever it's opened from (GRYT-1775). */
        router.push({ pathname: "/messages/conversation/[id]", params: { id: conversation.conversation_id } });
      }}
      onLongPress={() => {
        rowRef.current?.measureInWindow((x, y, width, height) =>
          setMenu({ x, y, width, height }),
        );
      }}
      accessibilityRole="button"
      accessibilityLabel={isGroup ? `Group ${title}` : `Direct message with ${other.nickname}`}
      /* Deliberately the channel row's measurements. The two lists sit against
         each other, and a point smaller reads as a lesser kind of thing. */
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(4),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      {/* 24 against the channel icons' 20. A circle reads smaller than a glyph
          of the same box, and matching the numbers rather than the optics left
          the faces looking shrunken next to the hashes. */}
      <View>
        {!!isGroup && (
          /* A rounded square, because a circle is a person everywhere else here.
             Drawn from the name through the generator servers use. */
          uploaded ? (
            <PersonAvatar name={title} source={uploaded} size={24} variant="bare" />
          ) : (
            <View style={{ width: 24, height: 24, borderRadius: theme.radius.sm, overflow: "hidden" }}>
              <SvgXml xml={eggAvatarSvg(title)} width={24} height={24} />
            </View>
          )
        )}
        {!isGroup && (
          <PersonAvatar
            name={other.nickname}
            source={host && other.avatar_file_id ? avatarSource(host, other.avatar_file_id) : null}
            size={24}
            variant="bare"
          />
        )}
        {around && member ? <StatusDot member={member} ring={theme.color.bg} /> : null}
      </View>

      <Text
        numberOfLines={1}
        style={{ color: theme.color.text, fontSize: 17, fontWeight: "500", flex: 1, minWidth: 0 }}
      >
        {title}
      </Text>

      {/* A dot rather than a word. The row is already tight and the name is
          what somebody is reading; the label is for anybody who cannot see the
          dot, because a mark with no name is not a state you can act on. */}
      <UnreadPill count={unread} mentions={named} />

      {liveCalls.has(conversation.conversation_id) ? (
        <View
          accessibilityRole="image"
          accessibilityLabel="A call is happening here"
          style={{
            width: 8,
            height: 8,
            borderRadius: theme.radius.full,
            backgroundColor: theme.color.accent,
          }}
        />
      ) : null}
    </Pressable>

    <AnchoredPopup
      open={menu !== null}
      anchor={menu}
      onDismiss={() => setMenu(null)}
      align="start"
      style={{ paddingVertical: theme.space(1), minWidth: 200 }}
    >
      <View accessibilityRole="menu">
        {host && unread + named > 0 ? (
          <Pressable
            accessibilityRole="menuitem"
            onPress={() => {
              setMenu(null);
              readConversation(socket, host, id);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: theme.space(4),
              paddingVertical: theme.space(2.5),
              backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
            })}
          >
            <Text style={{ color: theme.color.text, fontSize: 14 }}>Mark as read</Text>
          </Pressable>
        ) : null}

        {/* Group settings holds Leave, so it stays whatever the role may do.
            Starting a group is the + beside Direct messages. */}
        {isGroup ? (
          <Pressable
            accessibilityRole="menuitem"
            onPress={() => {
              setMenu(null);
              onOpenGroupDialog(conversation);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: theme.space(4),
              paddingVertical: theme.space(2.5),
              backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
            })}
          >
            <Text style={{ color: theme.color.text, fontSize: 14 }}>Group settings</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="menuitem"
          onPress={() => {
            setMenu(null);
            if (!host || !me) return;
            if (hidden) {
              showConversation(host, me, conversation.conversation_id);
              return;
            }
            hideConversation(host, me, conversation.conversation_id);
            toast.show({ description: `Hid ${title}` });
          }}
          style={({ pressed }) => ({
            paddingHorizontal: theme.space(4),
            paddingVertical: theme.space(2.5),
            backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
          })}
        >
          <Text style={{ color: theme.color.text, fontSize: 14 }}>
            {hidden ? "Show this conversation" : "Hide this conversation"}
          </Text>
          {/* Says what it does not do. "Hide" on its own reads as a soft
              delete to enough people that the sentence is worth the room. */}
          {!hidden ? (
            <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: 2 }}>
              Keeps the messages. Comes back if they write.
            </Text>
          ) : null}
        </Pressable>
      </View>
    </AnchoredPopup>
    </>
  );
}
