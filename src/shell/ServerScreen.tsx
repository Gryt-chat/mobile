import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { AnchoredPopup, Button, Dialog, Spinner, Text, useTheme } from "@gryt/ui-native";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { KeyboardIcon } from "phosphor-react-native/src/icons/Keyboard";
import { PlugsIcon } from "phosphor-react-native/src/icons/Plugs";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";

import { LivePresence } from "./LivePresence";
import { GroupDialog } from "./GroupDialog";
import { MembersDrawer, StatusDot } from "./MembersDrawer";
import { ServerHeader } from "./ServerHeader";
import { useTabBarSpace } from "./TabBar";
import { useShell } from "./ShellContext";
import { UnreadPill } from "./UnreadPill";
import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import { occupancy } from "../connection/presence";
import { useCalls } from "../connection/CallsProvider";
import { useDirectMessages, type DirectConversation } from "../connection/DirectMessagesProvider";
import { conversationTitle } from "../connection/directMessages";
import { canOnServer } from "../connection/permissions";
import { useActionSheet } from "../ui/actionSheet";
import { useMembers } from "../connection/MembersProvider";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { attachmentUrl } from "../chat/files";
import { eggAvatarSvg } from "@gryt/owl";
import { getServerHttpBase } from "../servers/address";
import { NoServers } from "../servers/NoServers";
import type { Channel, ConnectionState, SidebarItem } from "../connection/types";

/**
 * The Server tab: the header, what is happening in voice, and the channels. The
 * list arrives on `server:details`, which only answers a socket that has
 * completed the join.
 *
 * **Having no servers is a state of this tab, not a different app.** Replacing
 * the whole screen put signing in and settings out of reach for exactly the
 * person most likely to need them. The header goes with it, and since the
 * switcher is the only link to `/discovery`, the empty state carries that link.
 *
 * **The members drawer is opened from here rather than from the header**, so it
 * survives the header being replaced — unmounting a modal mid-dismiss is how
 * iOS ends up with a scrim and no panel.
 */
/**
 * Whether this server would take a new conversation from this account.
 *
 * Read in two places rather than passed down through the section and the row,
 * which are three components apart and share no other prop. `canOnServer`
 * answers true for a server that has never heard of the permission, so this
 * hides nothing on a server running the release before it existed.
 */
function useCanStartDm(): boolean {
  const { state } = useServerConnection();
  return canOnServer(
    state.status === "ready" ? state.details : undefined,
    "send_direct_messages",
  );
}

export function ServerScreen() {
  const theme = useTheme();
  const { state, me, getAccessToken } = useServerConnection();
  const {
    conversations,
    withMember,
    open: openDm,
    createGroup,
    updateGroup,
    addToGroup,
    leaveGroup,
  } = useDirectMessages();

  /**
   * Who was asked for, until their conversation turns up.
   *
   * `dm:open` has no reply of its own — the conversation arrives on
   * `dm:opened`, which is the same event the other end hears — so the screen
   * remembers the target and navigates when it appears. Going straight to a
   * derived id instead would mean this file owning a rule the server also owns,
   * and the two drifting would open an empty conversation.
   */
  const pendingDm = useRef<string | null>(null);

  /**
   * The group dialog, and what it is for.
   *
   * `null` closed, a conversation means managing that one, an array of ids
   * means starting a new group with those people ticked.
   */
  const [groupDialog, setGroupDialog] = useState<DirectConversation | string[] | null>(null);

  /** Send a picture to this server and hand back the file id it stored. */
  const uploadGroupImage = async (uri: string, filename: string): Promise<string> => {
    const accessToken = await getAccessToken();
    const host = server?.host;
    if (!accessToken || !host) throw new Error("Not signed in to this server");

    const form = new FormData();
    /* React Native's FormData takes this shape rather than a Blob; there is no
       File here and reading the whole image into memory to make one would be
       worse on a phone than letting the platform stream it. */
    form.append("file", { uri, name: filename, type: "image/jpeg" } as unknown as Blob);

    /* The avatar endpoint, because a group picture is the same job — one square
       image through the same resizer. A second endpoint is a second place for
       the limits to drift. */
    const response = await fetch(`${getServerHttpBase(host)}/api/uploads/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const data = (await response.json().catch(() => ({}))) as {
      avatarFileId?: string;
      message?: string;
    };
    if (!response.ok || !data.avatarFileId) {
      throw new Error(data.message || "The server would not take that picture");
    }
    return data.avatarFileId;
  };

  const openDmWith = (serverUserId: string) => {
    const existing = withMember(serverUserId);
    if (existing) {
      router.push({ pathname: "/channel/[id]", params: { id: existing.conversation_id } });
      return;
    }
    pendingDm.current = serverUserId;
    openDm(serverUserId);
  };

  useEffect(() => {
    const target = pendingDm.current;
    if (!target) return;
    const match = conversations.find((c) => c.other.server_user_id === target);
    if (!match) return;
    pendingDm.current = null;
    router.push({ pathname: "/channel/[id]", params: { id: match.conversation_id } });
  }, [conversations]);
  const { servers, setAddServerOpen, lan, server } = useShell();
  const [membersOpen, setMembersOpen] = useState(false);
  const canStartDm = useCanStartDm();

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
        <ServerBody
          channels={state.channels}
          sidebar={state.sidebar}
          onOpenGroupDialog={setGroupDialog}
        />
      ) : (
        <Status state={state} />
      )}

      <MembersDrawer
        open={membersOpen}
        onOpenChange={setMembersOpen}
        channels={channels}
        me={me?.serverUserId ?? null}
        /* Without this the row is not pressable at all, which is the whole
           gate: a role that may not send direct messages gets a member list
           that does not offer to. The server refuses `dm:open` either way. */
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
        existing={Array.isArray(groupDialog) ? undefined : (groupDialog ?? undefined)}
        initialMemberIds={Array.isArray(groupDialog) ? groupDialog : []}
        uploadImage={uploadGroupImage}
        onCreate={createGroup}
        onUpdate={updateGroup}
        onAdd={addToGroup}
        onLeave={leaveGroup}
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
 * What is live, then the sidebar order rendered flat. **A `separator` is a
 * heading, not a container** — it does not hold the channels after it — so this
 * sorts by position and renders linearly rather than building a tree that does
 * not exist. No sidebar falls back to the bare channel list.
 *
 * The live strip scrolls with the list rather than being pinned: pinned, it
 * would cost the same height on a quiet server as on a busy one.
 *
 * The join question is here rather than on either child, because both the strip
 * and the rows ask it.
 */
function ServerBody({
  channels,
  sidebar,
  onOpenGroupDialog,
}: {
  channels: Channel[];
  sidebar: SidebarItem[];
  onOpenGroupDialog: (target: DirectConversation | string[]) => void;
}) {
  const tabBarSpace = useTabBarSpace();
  const theme = useTheme();
  const { all } = useMembers();
  const byId = new Map(channels.map((c) => [c.id, c]));

  /* Where this person has been named and not read it. Per channel, unlike the
   * server-wide unread count, because the server records when a mention was
   * seen and there is a cursor to be per channel about. */
  const { server } = useShell();
  const { mentions } = useConnections();
  const mentionCounts = (server && mentions[server.host]) || {};

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
           behind it unless the list reserves the room itself. `useTabBarSpace`
           is measured from the bottom of the screen and already covers the
           safe area. */
        paddingBottom: theme.space(2) + tabBarSpace,
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
            mentions={mentionCounts[channel.id] ?? 0}
            onAskToJoin={setPending}
          />
        );
      })}

      <ConversationSection title="Direct messages" kind="dm" onOpenGroupDialog={onOpenGroupDialog} />
      <ConversationSection title="Groups" kind="group" onOpenGroupDialog={onOpenGroupDialog} />

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

/**
 * Whether this account may point a channel at a permission scope.
 *
 * `manage_channels`, which is what the server gates
 * `server:channels:scope:set` on — deliberately not `manage_roles`, which is
 * the templates screen. `canOnServer` answers true for a server that has never
 * heard of the permission, so this stays offered against an older build and is
 * refused there rather than hidden.
 */
function useCanManageChannels(): boolean {
  const { state } = useServerConnection();
  return canOnServer(state.status === "ready" ? state.details : undefined, "manage_channels");
}

function ChannelRow({
  channel,
  here,
  mentions,
  onAskToJoin,
}: {
  channel: Channel;
  /** How many people are in it. Voice only, and zero for an empty room. */
  here: number;
  /** How many times this person has been named here and not read it. */
  mentions: number;
  /** Voice only. The row asks; it does not join. */
  onAskToJoin: (channel: Channel) => void;
}) {
  const theme = useTheme();
  const { voiceChannel } = useShell();
  const Icon = channel.type === "voice" ? SpeakerHighIcon : HashIcon;
  const canManageChannels = useCanManageChannels();
  const present = useActionSheet();

  /**
   * Hold a channel to decide who can use it.
   *
   * A menu rather than a settings screen listing every channel, because the
   * channel is already in front of you and the desktop reaches this the same
   * way — from the channel, not from a list of them.
   *
   * The platform's own action sheet, like the server menu, so it stacks over
   * the drawer rather than fighting it. Absent entirely without
   * `manage_channels`, which leaves the row exactly as it was.
   */
  const openMenu = () => {
    void present({
      title: channel.name,
      options: ["Channel permissions", "Cancel"],
      cancelButtonIndex: 1,
    }).then((index) => {
      if (index !== 0) return;
      router.push({
        pathname: "/channel-permissions",
        params: { id: channel.id, name: channel.name },
      });
    });
  };

  /* The room you are in, marked on the row as well as in the panel above.
   * Two places, because the panel scrolls away and the list is the index. */
  const inThisOne = channel.id === voiceChannel?.id;

  return (
    /* Same shape as the desktop sidebar: a ghost button per row, filled with
     * the accent only for the one you are in. Every row used to be a bare
     * Pressable that tinted its background on press, which is the same
     * information drawn a different way in each client — and the phone was the
     * one that did not say "you are here" until you looked at the colour of
     * the text. The badge sits outside the button and over its corner, because
     * a button that has to make room for it is a button that changes width. */
    /* Inset so the pill does not run into the screen edge — the desktop
     * sidebar keeps the same gap, and without it a ghost row and a selected one
     * start in different places. Half the row's old padding, because the button
     * carries the rest of it now. */
    <View style={{ width: "100%", position: "relative", paddingHorizontal: theme.space(2) }}>
      <Button
        size="small"
        tone={inThisOne ? "primary" : "ghost"}
        style={{ width: "100%", justifyContent: "flex-start" }}
        onPress={() => {
          /* A voice channel is not somewhere you navigate to. Joining one has
           * to leave you where you are — the call outlives the screen, and a
           * phone that pushed a route for it would put the call behind a back
           * button.
           *
           * It also does not happen on this press any more. A text channel
           * opens a screen you can back out of; a voice channel opens a
           * microphone, and on a phone the two rows are a thumb-width apart. */
          if (channel.type === "voice") {
            onAskToJoin(channel);
            return;
          }
          router.push({ pathname: "/channel/[id]", params: { id: channel.id } });
        }}
        onLongPress={canManageChannels ? openMenu : undefined}
        accessibilityLabel={
          channel.type === "voice" && here > 0
            ? `${channel.name}, ${here === 1 ? "1 person" : `${here} people`} here`
            : channel.name
        }
        startIcon={
          <Icon
            size={16}
            color={inThisOne ? theme.color.onAccent : theme.color.muted}
            weight={channel.type === "voice" ? "fill" : "bold"}
          />
        }
      >
        {/* One line, always. A channel name is as long as whoever made it felt
            like, and a wrapped one does not read as a longer name — it reads as
            two rows, because the icon stays put on the first line and the
            second starts under it. `minWidth: 0` is what actually lets it
            truncate: a flex child's default minimum is its content, so without
            it the text pushes the count off the row rather than shortening. */}
        <Text
          numberOfLines={1}
          style={{
            color: inThisOne ? theme.color.onAccent : theme.color.text,
            fontSize: 15,
            fontWeight: "500",
            flex: 1,
            minWidth: 0,
          }}
        >
          {channel.name}
        </Text>

        {/* The same slot the desktop row keeps for a channel's voice settings,
            and the same 14px muted glyph. Push to talk is the only one of the
            four the app models — the server sends the rest and the mobile
            Channel type has never carried them. */}
        {channel.requirePushToTalk ? (
          <KeyboardIcon size={14} color={theme.color.muted} weight="fill" />
        ) : null}

        {/* A count and no faces. The faces are in the strip, and drawing them
            twice would make the list the second-best copy of it. */}
        {here > 0 ? (
          <Text
            style={{
              color: inThisOne ? theme.color.onAccent : theme.color.muted,
              fontSize: 13,
            }}
          >
            {here}
          </Text>
        ) : null}

        {/* Filled, where the voice count beside it is plain muted text. The two
            say different things: how many people are in a room is information,
            and being asked something is a thing you owe somebody. Same pill the
            server switcher draws, so a badge means one thing in the app.

            In the row rather than over its corner, which is where the desktop
            puts it. A sidebar is narrow enough for a badge to hang off the
            edge; a phone row is the full width of the screen, so the same
            offset put half the number past the right edge. */}
        <UnreadPill count={0} mentions={mentions} />
      </Button>
    </View>
  );
}

/**
 * The direct messages open on this server, under its channels.
 *
 * Under the channels rather than off in a tab of its own, and that placement is
 * the point: these conversations belong to this server. Messaging the same
 * person somewhere else is a different conversation with different history, so
 * a list that sat outside the server would be claiming something untrue.
 *
 * Nothing is drawn until there is one. Somebody who has never opened a DM does
 * not need a heading telling them so, and a server too old to have the events
 * never sends any.
 */
function ConversationSection({
  title,
  kind,
  onOpenGroupDialog,
}: {
  title: string;
  kind: "dm" | "group";
  onOpenGroupDialog: (target: DirectConversation | string[]) => void;
}) {
  const theme = useTheme();
  const { server } = useShell();
  const { directMessages, groups } = useDirectMessages();
  const conversations = kind === "group" ? groups : directMessages;

  if (conversations.length === 0) return null;

  return (
    <View>
      <Text
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
        {title}
      </Text>

      {conversations.map((conversation) => (
        <DirectMessageRow
          key={conversation.conversation_id}
          conversation={conversation}
          host={server?.host ?? null}
          onOpenGroupDialog={onOpenGroupDialog}
        />
      ))}
    </View>
  );
}

function DirectMessageRow({
  conversation,
  host,
  onOpenGroupDialog,
}: {
  conversation: DirectConversation;
  host: string | null;
  onOpenGroupDialog: (target: DirectConversation | string[]) => void;
}) {
  const theme = useTheme();
  const { byId } = useMembers();
  const { setHidden } = useDirectMessages();
  const canStartDm = useCanStartDm();
  const { liveCalls } = useCalls();
  const { other } = conversation;

  /**
   * The long-press menu, anchored to the row.
   *
   * `AnchoredPopup` rather than `Menu`, and not for want of trying it. `Menu`
   * takes its anchor from `Menu.Trigger`, whose own press opens the menu — and
   * a press on this row has to open the conversation. Without a trigger there
   * is no anchor and the popup renders nothing at all. So the row measures
   * itself and drives the popup; the item below is `Menu.Item`'s metrics by
   * hand, which is the part worth keeping in step if that component moves.
   */
  const rowRef = useRef<View>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  /* The same person the member list is drawing, when they are still here. A
     conversation outlives a membership — somebody can leave and the history
     stays — so this is a lookup that is allowed to miss, and a miss simply
     means no dot rather than a gap where one should be. */
  const member = byId.get(other.server_user_id);
  const isGroup = conversation.kind === "group";
  const title = conversationTitle(conversation);
  const uploaded =
    isGroup && host && conversation.icon_file_id
      ? attachmentUrl(host, conversation.icon_file_id)
      : null;

  /* Only when there is something to say. In the members drawer an offline dot
     sits inside an "Offline" group and reads as part of it; here it would be a
     grey mark on every conversation that has gone quiet, which is most of
     them, and a list of dots that are all the same says nothing. */
  const around = !isGroup && member && member.status !== "offline";

  return (
    <>
    <Pressable
      ref={rowRef}
      onPress={() => {
        /* The same route a channel opens. A direct message is a conversation
           like any other once it exists, so it reuses the screen rather than
           having a second one that would drift from it. */
        router.push({ pathname: "/channel/[id]", params: { id: conversation.conversation_id } });
      }}
      onLongPress={() => {
        rowRef.current?.measureInWindow((x, y, width, height) =>
          setMenu({ x, y, width, height }),
        );
      }}
      accessibilityRole="button"
      accessibilityLabel={isGroup ? `Group ${title}` : `Direct message with ${other.nickname}`}
      /* Deliberately the channel row's measurements, down to the numbers. The
         two lists sit against each other in one column, and a direct message
         set even a point smaller reads as a lesser kind of thing rather than
         as a different kind — which was exactly how the first version looked. */
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
        {isGroup ? (
          /* A rounded square, because a circle is a person everywhere else in
             this app — the same rule `ServerIcon` follows. Drawn from the name
             through the generator servers use, so when that becomes the eggs
             groups follow with no change here. */
          uploaded ? (
            <PersonAvatar name={title} source={uploaded} size={24} variant="bare" />
          ) : (
            <View style={{ width: 24, height: 24, borderRadius: theme.radius.sm, overflow: "hidden" }}>
              <SvgXml xml={eggAvatarSvg(title)} width={24} height={24} />
            </View>
          )
        ) : (
          <PersonAvatar
            name={other.nickname}
            source={host && other.avatar_file_id ? attachmentUrl(host, other.avatar_file_id) : null}
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
        {/* Group settings holds Leave, so it stays whatever the role may
            do. Starting a new group is `dm:group:create`, which the server
            refuses without the permission. */}
        {isGroup || canStartDm ? (
          <Pressable
            accessibilityRole="menuitem"
            onPress={() => {
              setMenu(null);
              onOpenGroupDialog(
                /* A group opens its own settings. A one-to-one starts a new group
                   with that person ticked — it never turns the pair conversation
                   into one, which is the same rule the server holds. */
                isGroup ? conversation : [other.server_user_id],
              );
            }}
            style={({ pressed }) => ({
              paddingHorizontal: theme.space(4),
              paddingVertical: theme.space(2.5),
              backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
            })}
          >
            <Text style={{ color: theme.color.text, fontSize: 14 }}>
              {isGroup ? "Group settings" : "New group"}
            </Text>
            {!isGroup ? (
              <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: 2 }}>
                Keeps this conversation as it is.
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="menuitem"
          onPress={() => {
            setMenu(null);
            setHidden(conversation.conversation_id, true);
          }}
          style={({ pressed }) => ({
            paddingHorizontal: theme.space(4),
            paddingVertical: theme.space(2.5),
            backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
          })}
        >
          <Text style={{ color: theme.color.text, fontSize: 14 }}>Hide this conversation</Text>
          {/* Says what it does not do. "Hide" on its own reads as a soft
              delete to enough people that the sentence is worth the room. */}
          <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: 2 }}>
            Keeps the messages. Comes back if they write.
          </Text>
        </Pressable>
      </View>
    </AnchoredPopup>
    </>
  );
}
