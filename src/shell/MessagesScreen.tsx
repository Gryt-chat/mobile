import { router } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Tabs, Text, useTheme, useToast, type NativeTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { ChatTeardropTextIcon } from "phosphor-react-native/src/icons/ChatTeardropText";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { PushPinIcon } from "phosphor-react-native/src/icons/PushPin";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { FAKE_ACTIVITY, FAKE_PREVIEWS, FAKE_UNREAD, fakeDmsOn, fakeFriends, fakeStatus } from "../dev/fakeDms";
import { activityLines } from "../connection/activityLine";
import { openLocalArchive } from "../archive/localArchive";
import { avatarSource } from "../chat/files";
import { useAllConversations, type ConversationEntry } from "../connection/AllConversationsProvider";
import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import { useDirectMessages, type DirectConversation } from "../connection/DirectMessagesProvider";
import { conversationTitle } from "../connection/directMessages";
import { hideConversation, isBackFromHiding, showConversation, useHiddenAcross } from "../connection/hiddenConversations";
import { confirmServerFriend, friendAction, friendsOf, useFriends } from "../connection/friendsStore";
import type { ServerFriendPerson } from "../connection/friendList";
import { useMembers } from "../connection/MembersProvider";
import { canOnServer } from "../connection/permissions";
import { readConversation, useUnread } from "../connection/unread";
import { getServerHttpBase } from "../servers/address";
import { uploadGroupPicture } from "../connection/groupPicture";
import { identityScopeFor } from "../identity/scope";
import { ServerIcon } from "../servers/ServerIcon";
import { useTwoPane } from "./twoPane";
import { STATUS_LABEL, type Status } from "./data";
import { pinIndex, setPinned, usePins } from "./dmPins";
import { FilteredSection } from "./FilteredSection";
import { GroupDialog } from "./GroupDialog";
import { GroupFace } from "./GroupFace";
import { NewMessageDialog } from "./NewMessageDialog";
import { useOpenDm } from "./openDm";
import { useShell } from "./ShellContext";
import { BAR, useBarBottom } from "./TabBar";

/** The status colours the desktop member list uses: memberStatus.ts, by scale step 9. */
export function statusColor(theme: NativeTheme, status: Status): string {
  const step = 8;
  if (status === "in_voice") return theme.scales.accent[step];
  if (status === "online") return theme.scales.success[step];
  if (status === "afk") return theme.scales.warning[step];
  return theme.scales.neutral[step];
}

/** A face with its presence dot, cut out of `ground`. No dot when there's no data. */
function Face({ name, source, size, status, ground }: { name: string; source?: string | null; size: number; status?: Status; ground: string }) {
  const theme = useTheme();
  const dot = Math.max(10, Math.round(size / 4.2));
  return (
    <View style={{ width: size, height: size }}>
      <PersonAvatar name={name} source={source} size={size} />
      {status ? (
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: dot + 6,
            height: dot + 6,
            borderRadius: (dot + 6) / 2,
            backgroundColor: ground,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: statusColor(theme, status) }} />
        </View>
      ) : null}
    </View>
  );
}

/** Short enough to sit beside a name: a time today, a weekday, then a date. */
function when(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  if (days < 1) return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: "short" });
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The last message this phone holds for each conversation, as one line. */
function usePreviews(entries: ConversationEntry[], ownIdFor: (host: string) => string | undefined): Map<string, string> {
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const wanted = entries.map((e) => `${e.host}/${e.conversation.conversation_id}/${e.conversation.last_message_at}`).join("\n");
  useEffect(() => {
    if (fakeDmsOn) {
      setPreviews(new Map(entries.map((e) => [`${e.host}/${e.conversation.conversation_id}`, FAKE_PREVIEWS[e.conversation.conversation_id] ?? ""])));
      return;
    }
    let live = true;
    void openLocalArchive()
      .then(async (archive) => {
        const next = new Map<string, string>();
        for (const e of entries) {
          const [last] = await archive.messages.page(identityScopeFor(e.host), e.conversation.conversation_id, { limit: 1 });
          if (!last) continue;
          const body = last.text.trim().replace(/\s+/g, " ") || (Object.keys(last.attachments).length ? "Sent a file" : "");
          if (!body) continue;
          const sender = e.conversation.kind === "group"
            ? `${e.conversation.members.find((m) => m.server_user_id === last.senderId)?.nickname ?? ""}: `
            : "";
          const who = last.senderId === ownIdFor(e.host) ? "You: " : sender;
          next.set(`${e.host}/${e.conversation.conversation_id}`, `${who === ": " ? "" : who}${body}`);
        }
        if (live) setPreviews(next);
      })
      .catch(() => {
        // No archive on this phone yet: rows go without previews.
      });
    return () => {
      live = false;
    };
    // `wanted` is the identity of `entries`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  return previews;
}

function Label({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space(4), paddingTop: theme.space(4), paddingBottom: theme.space(1.5) }}>
      <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>{children}</Text>
      {right ? <View style={{ marginLeft: "auto" }}>{right}</View> : null}
    </View>
  );
}

/**
 * The Messages tab (P1, P2): your direct messages across every server, and your
 * friends, with the server each one is on. Opening one switches to its server.
 */
export function MessagesScreen() {
  const theme = useTheme();
  const twoPane = useTwoPane();
  const insets = useSafeAreaInsets();
  const barBottom = useBarBottom();
  const { server, servers, setServer } = useShell();
  const { byHost } = useConnections();
  const { state, getAccessToken, me } = useServerConnection();
  const { byId } = useMembers();
  const everyEntry = useAllConversations();
  const toast = useToast();
  const { updateGroup, addToGroup, leaveGroup } = useDirectMessages();
  const realUnread = useUnread();
  const unread = fakeDmsOn && server ? { ...realUnread, [server.host]: FAKE_UNREAD } : realUnread;
  const pins = usePins();
  const openDmWith = useOpenDm();
  // Subscribes to the friends store; the rows below read every server's list.
  useFriends(server?.host);
  const [tab, setTab] = useState<"chats" | "friends">("chats");
  const [query, setQuery] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState<DirectConversation | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  /** A DM asked for on another server: opened once that server is the one we're on. */
  const [pendingDm, setPendingDm] = useState<{ host: string; serverUserId: string } | null>(null);
  useEffect(() => {
    if (!pendingDm || server?.host !== pendingDm.host || state.status !== "ready") return;
    setPendingDm(null);
    openDmWith(pendingDm.serverUserId);
  }, [pendingDm, server?.host, state.status, openDmWith]);

  const ownIdFor = (host: string) => byHost[host]?.me?.serverUserId;

  // Hidden is this device's answer per account, as on the desktop, so the split is made here.
  const hiddenAt = useHiddenAcross(Object.fromEntries(servers.map((s) => [s.host, ownIdFor(s.host)])));
  const entries: ConversationEntry[] = [];
  const hiddenEntries: ConversationEntry[] = [];
  const returned: ConversationEntry[] = [];
  for (const e of everyEntry) {
    const at = hiddenAt[e.host]?.[e.conversation.conversation_id];
    if (at === undefined) entries.push(e);
    else if (isBackFromHiding(at, e.conversation.last_message_at)) {
      entries.push(e);
      returned.push(e);
    } else hiddenEntries.push(e);
  }
  const returnedKey = returned.map((e) => `${e.host}/${e.conversation.conversation_id}`).join();
  useEffect(() => {
    for (const e of returned) {
      const own = ownIdFor(e.host);
      if (own) showConversation(e.host, own, e.conversation.conversation_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt each render, the key is what changes
  }, [returnedKey]);
  const serverName = (host: string) => servers.find((s) => s.host === host)?.name ?? host;
  const statusHere = (serverUserId: string): Status | undefined =>
    fakeDmsOn ? fakeStatus(serverUserId) : (byId.get(serverUserId)?.status as Status | undefined);
  const statusOn = (host: string, serverUserId: string): Status | undefined =>
    host !== server?.host ? undefined : statusHere(serverUserId);

  const previews = usePreviews(entries, ownIdFor);
  // What they're doing, as the member list words it: "Playing Counter-Strike 2".
  const activityOf = (host: string, serverUserId: string): string | undefined => {
    if (host !== server?.host) return undefined;
    if (fakeDmsOn) return FAKE_ACTIVITY[serverUserId];
    const member = byId.get(serverUserId);
    return member ? activityLines(member, Date.now())?.headline : undefined;
  };

  const needle = query.trim().toLowerCase();
  const shown = entries.filter((e) => !needle || conversationTitle(e.conversation).toLowerCase().includes(needle) || serverName(e.host).toLowerCase().includes(needle));
  const pinned = shown.filter((e) => pinIndex(pins, e.host, e.conversation.conversation_id) >= 0)
    .sort((a, b) => pinIndex(pins, a.host, a.conversation.conversation_id) - pinIndex(pins, b.host, b.conversation.conversation_id));
  const rest = shown.filter((e) => pinIndex(pins, e.host, e.conversation.conversation_id) < 0);

  // A 1:1 whose name is on another row names its server.
  const clashes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of everyEntry) if (e.conversation.kind !== "group") seen.set(conversationTitle(e.conversation), (seen.get(conversationTitle(e.conversation)) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
  }, [everyEntry]);

  const friendLists = fakeDmsOn && server
    ? [fakeFriends(server.host)]
    : servers.map((s) => friendsOf(s.host)).filter((f): f is NonNullable<typeof f> => !!f);
  const waiting = friendLists.reduce((n, f) => n + f.incoming.length + f.friends.filter((p) => !p.confirmed).length, 0);

  const open = (e: ConversationEntry) => {
    if (e.host !== server?.host) setServer(e.host);
    router.push({ pathname: "/messages/conversation/[id]", params: { id: e.conversation.conversation_id } });
  };

  const row = (e: ConversationEntry, hidden = false) => {
    const { host, conversation } = e;
    const title = conversationTitle(conversation);
    const count = unread[host]?.[conversation.conversation_id] ?? 0;
    const isPinned = pinIndex(pins, host, conversation.conversation_id) >= 0;
    const preview = previews.get(`${host}/${conversation.conversation_id}`);
    return (
      <Pressable
        key={`${host}/${conversation.conversation_id}`}
        testID={`dm-row-${conversation.conversation_id}`}
        onPress={() => open(e)}
        onLongPress={() =>
          Alert.alert(title, hidden ? undefined : "Hiding keeps the messages. It comes back if they write.", [
            ...(count > 0
              ? [{ text: "Mark as read", onPress: () => readConversation(byHost[host]?.socket ?? null, host, conversation.conversation_id) }]
              : []),
            { text: isPinned ? "Unpin" : "Pin to the top", onPress: () => setPinned(host, conversation.conversation_id, !isPinned) },
            ...(conversation.kind === "group"
              ? [{
                  text: "Group settings",
                  onPress: () => {
                    if (host !== server?.host) setServer(host);
                    setGroupDialog(conversation);
                  },
                }]
              : []),
            {
              text: hidden ? "Show this conversation" : "Hide this conversation",
              onPress: () => {
                const own = ownIdFor(host);
                if (!own) return;
                if (hidden) showConversation(host, own, conversation.conversation_id);
                else {
                  hideConversation(host, own, conversation.conversation_id);
                  toast.show({ description: `Hid ${title}` });
                }
              },
            },
            { text: "Cancel", style: "cancel" },
          ])
        }
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `${title}, ${count} unread` : title}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(2.5),
          backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
        })}
      >
        {conversation.kind === "group" ? (
          <GroupFace host={host} conversation={conversation} size={40} />
        ) : (
          <Face
            name={conversation.other.nickname}
            source={conversation.other.avatar_file_id ? avatarSource(host, conversation.other.avatar_file_id) : null}
            size={40}
            status={statusOn(host, conversation.other.server_user_id)}
            ground={theme.color.bg}
          />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: theme.color.text, fontSize: 15, fontWeight: count > 0 ? "700" : "600" }}>{title}</Text>
            {conversation.kind !== "group" && clashes.has(title) ? (
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>· {serverName(host)}</Text>
            ) : null}
            <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}>
              {isPinned ? <PushPinIcon size={12} color={theme.color.muted} weight="fill" /> : null}
              <Text style={{ color: count > 0 ? theme.color.text : theme.color.muted, fontSize: 12, fontWeight: count > 0 ? "700" : "400", fontVariant: ["tabular-nums"] }}>{when(conversation.last_message_at)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: count > 0 ? theme.color.text : theme.color.muted, fontSize: 13 }}>
              {preview ?? (conversation.kind === "group" ? `${conversation.members.length + 1} people` : " ")}
            </Text>
            {count > 0 ? (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: theme.color.accent, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: theme.color.onAccent, fontSize: 11, fontWeight: "700" }}>{count}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  /* Face, name and the server it came through, so you know who's asking. */
  const person = (host: string, p: ServerFriendPerson, line: string, actions: ReactNode, key: string) => (
    <View key={key} testID={`friend-row-${p.serverUserId}`} style={{ paddingHorizontal: theme.space(4), paddingVertical: theme.space(2), gap: theme.space(1.5) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <Face name={p.nickname ?? "Somebody"} size={40} status={statusOn(host, p.serverUserId)} ground={theme.color.bg} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{p.nickname || "Somebody"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <ServerIcon host={host} name={serverName(host)} size={14} />
            <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>{serverName(host)}</Text>
          </View>
        </View>
      </View>
      {line ? <Text style={{ color: theme.color.muted, fontSize: 13, paddingLeft: 52 }}>{line}</Text> : null}
      <View style={{ flexDirection: "row", gap: theme.space(2), paddingLeft: 52 }}>{actions}</View>
    </View>
  );

  const friend = (host: string, p: ServerFriendPerson) => {
    const status = statusOn(host, p.serverUserId);
    return (
      <View key={`${host}/${p.serverUserId}`} testID={`friend-row-${p.serverUserId}`} style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3), paddingHorizontal: theme.space(4), paddingVertical: theme.space(2) }}>
        <Face name={p.nickname ?? "Somebody"} size={40} status={status} ground={theme.color.bg} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{p.nickname || "Somebody"}</Text>
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
            {status ? activityOf(host, p.serverUserId) ?? STATUS_LABEL[status] : serverName(host)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Message ${p.nickname ?? ""}`}
          onPress={() => {
            if (host !== server?.host) setServer(host);
            openDmWith(p.serverUserId);
          }}
          onLongPress={() =>
            Alert.alert(p.nickname ?? "Friend", undefined, [
              { text: "Remove friend", style: "destructive", onPress: () => friendAction(host, "remove", p.serverUserId) },
              { text: "Cancel", style: "cancel" },
            ])
          }
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surfaceRaised, alignItems: "center", justifyContent: "center" }}
        >
          <ChatTeardropTextIcon size={16} color={theme.color.text} />
        </Pressable>
      </View>
    );
  };

  const matches = (p: ServerFriendPerson) => !needle || (p.nickname ?? "").toLowerCase().includes(needle);
  const requests = friendLists.flatMap((f) => [
    ...f.incoming.filter(matches).map((p) =>
      person(f.host, p, "Wants to be friends", (
        <>
          <Button size="small" tone="primary" onPress={() => friendAction(f.host, "accept", p.serverUserId)}>Accept</Button>
          <Button size="small" tone="neutral" onPress={() => friendAction(f.host, "decline", p.serverUserId)}>Decline</Button>
        </>
      ), `in/${f.host}/${p.serverUserId}`),
    ),
    // friendList.ts: the server lists a friendship this phone never asked for or accepted.
    ...f.friends.filter((p) => !p.confirmed && matches(p)).map((p) =>
      person(f.host, p, "The server says you’re friends. Until you add them here, they can’t call you on this phone.", (
        <>
          <Button size="small" tone="primary" onPress={() => confirmServerFriend(f.host, p)}>Add</Button>
          <Button size="small" tone="neutral" onPress={() => friendAction(f.host, "remove", p.serverUserId)}>Remove</Button>
        </>
      ), `un/${f.host}/${p.serverUserId}`),
    ),
  ]);
  const friends = friendLists.flatMap((f) => f.friends.filter((p) => p.confirmed && matches(p)).map((p) => friend(f.host, p)));

  /* New message is this server's, as everywhere on the phone: its members are the ones you can pick. */
  const canGroup = canOnServer(state.status === "ready" ? state.details : undefined, "create_groups");
  const uploadGroupImage = async (uri: string, filename: string): Promise<string> => {
    const accessToken = await getAccessToken();
    if (!accessToken || !server?.host) throw new Error("Not signed in to this server");
    return uploadGroupPicture(getServerHttpBase(server.host), accessToken, uri, filename);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space(4), paddingTop: theme.space(2), paddingBottom: theme.space(3) }}>
        <Text style={{ color: theme.color.text, fontSize: 28, fontWeight: "700" }}>Messages</Text>
        {server ? (
          <View style={{ marginLeft: "auto" }}>
            <Button
              size="small"
              tone="primary"
              onPress={() => setNewMessageOpen(true)}
              accessibilityLabel="New message"
              startIcon={<PlusIcon size={15} color={theme.color.onAccent} weight="bold" />}
            >
              {twoPane ? null : "New"}
            </Button>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: theme.space(4), paddingBottom: theme.space(2.5) }}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "chats" | "friends")}>
          <Tabs.List style={{ alignSelf: "stretch" }}>
            <Tabs.Tab value="chats" style={{ flex: 1 }}>Chats</Tabs.Tab>
            <Tabs.Tab value="friends" style={{ flex: 1 }}>
              {/* Tabs only styles a bare string, so the label is drawn here to carry the count. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: tab === "friends" ? theme.color.onAccent : theme.color.muted, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>Friends</Text>
                {waiting > 0 ? (
                  <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: tab === "friends" ? theme.color.onAccent : theme.color.accent }}>
                    <Text style={{ color: tab === "friends" ? theme.color.accent : theme.color.onAccent, fontSize: 11, fontWeight: "700" }}>{waiting}</Text>
                  </View>
                ) : null}
              </View>
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </View>

      <View style={{ paddingHorizontal: theme.space(4), paddingBottom: theme.space(1) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2), height: 42, paddingHorizontal: theme.space(3), borderRadius: 12, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border }}>
          <MagnifyingGlassIcon size={16} color={theme.color.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === "chats" ? "Find a person" : "Find a friend"}
            placeholderTextColor={theme.color.muted}
            accessibilityLabel={tab === "chats" ? "Find a person" : "Find a friend"}
            style={{ flex: 1, color: theme.color.text, fontSize: 15 }}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: barBottom + BAR.height + theme.space(6) }}>
        {tab === "chats" && (
          entries.length + hiddenEntries.length === 0 ? (
            <Text style={{ color: theme.color.muted, fontSize: 14, padding: theme.space(4) }}>
              No conversations yet. Start one with New, or from somebody in a member list.
            </Text>
          ) : (
            <>
              {pinned.length > 0 ? <Label>Pinned</Label> : null}
              {pinned.map((e) => row(e))}
              {rest.length > 0 ? <Label>Messages</Label> : null}
              {rest.map((e) => row(e))}
            </>
          )
        )}
        {tab === "chats" && hiddenEntries.length > 0 && (
          <>
            <Pressable
              onPress={() => setHiddenOpen((was) => !was)}
              accessibilityRole="button"
              accessibilityState={{ expanded: hiddenOpen }}
              accessibilityLabel={`Hidden, ${hiddenEntries.length}`}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2), paddingHorizontal: theme.space(4), paddingTop: theme.space(4), paddingBottom: theme.space(1) }}>
                <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>Hidden</Text>
                <Text style={{ color: theme.color.muted, fontSize: 12 }}>{hiddenEntries.length}</Text>
                {hiddenOpen ? <CaretDownIcon size={10} color={theme.color.muted} /> : <CaretRightIcon size={10} color={theme.color.muted} />}
              </View>
            </Pressable>
            {hiddenOpen ? hiddenEntries.map((e) => row(e, true)) : null}
          </>
        )}
        {tab === "chats" && <FilteredSection host={server?.host ?? null} />}
        {tab !== "chats" && (
          <>
            {requests.length > 0 ? <Label right={<Text style={{ color: theme.color.muted, fontSize: 13 }}>{requests.length}</Text>}>Requests</Label> : null}
            {requests}
            {friends.length > 0 ? <Label right={<Text style={{ color: theme.color.muted, fontSize: 13 }}>{friends.length}</Text>}>Friends</Label> : null}
            {friends}
            {requests.length + friends.length === 0 ? (
              <Text style={{ color: theme.color.muted, fontSize: 14, padding: theme.space(4) }}>
                No friends yet. Hold somebody’s name in a member list to add them.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

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

      {server ? (
        <NewMessageDialog
          open={newMessageOpen}
          onOpenChange={setNewMessageOpen}
          host={server.host}
          me={me?.serverUserId ?? null}
          canGroup={canGroup}
          uploadImage={uploadGroupImage}
          onMessage={openDmWith}
          onMessageOn={(host, serverUserId) => {
            if (host === server.host) openDmWith(serverUserId);
            else {
              setServer(host);
              setPendingDm({ host, serverUserId });
            }
          }}
          onOpenConversation={(id) => router.push({ pathname: "/messages/conversation/[id]", params: { id } })}
        />
      ) : null}
    </View>
  );
}
