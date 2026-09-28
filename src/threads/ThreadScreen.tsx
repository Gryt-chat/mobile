import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Spinner, Text, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { ChatsIcon } from "phosphor-react-native/src/icons/Chats";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { DotsThreeVerticalIcon } from "phosphor-react-native/src/icons/DotsThreeVertical";

import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";
import { canInChannel, canOnServer } from "../connection/permissions";
import { useMessages } from "../connection/useMessages";
import type { ThreadSummary } from "../connection/types";
import { MessageActions } from "../chat/MessageActions";
import { MentionReaderContext, type MentionReader } from "../chat/mentionReader";
import { abilitiesFor } from "../chat/messageAbilities";
import { isSystemMessage } from "../chat/system";
import { TypingLine } from "../chat/TypingLine";
import { useTyping } from "../chat/useTyping";
import { useAppearance } from "../preferences/appearance";
import { useSuppressEveryone } from "../notify/suppressEveryone";
import { Centered, Composer, ConnectionNotice, MessageRow } from "../shell/ChannelScreen";
import { groupMessages } from "../shell/messageGroups";
import { useShell } from "../shell/ShellContext";
import { useTabBarSpace } from "../shell/TabBar";
import { useActionSheet } from "../ui/actionSheet";
import { errorText, maySetStatus, repliesLabel, takesReplies, type ThreadGone } from "./threads";

type Status = ThreadSummary["status"];

/**
 * A thread, as its own screen: the message it hangs off, then its replies, then the
 * composer. The desktop's ThreadPanel when it takes the whole pane.
 */
export function ThreadScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { id, channel: channelId } = useLocalSearchParams<{ id: string; channel: string }>();
  const { state, socket, me, getAccessToken, online } = useServerConnection();
  const { threadMentions, markThreadMentionsRead } = useConnections();
  const { server } = useShell();
  const host = server?.host ?? "";
  const { all } = useMembers();
  const mentionable = useMemo(
    () => all.map((m) => m.nickname).filter((name): name is string => Boolean(name)),
    [all],
  );

  const channel = state.status === "ready" ? state.channels.find((c) => c.id === channelId) : undefined;
  const details = state.status === "ready" ? state.details : undefined;
  const mayHere = useCallback(
    (permission: string) => canInChannel(channel, (p) => canOnServer(details, p), permission),
    [channel, details],
  );

  const {
    messages,
    loading,
    loadingMore,
    error,
    loadOlder,
    send,
    retry,
    discard,
    react,
    edit,
    remove,
    report,
    thread,
    root,
    gone,
  } = useMessages(socket, channelId ?? null, {
    getAccessToken,
    me,
    host,
    threadId: id ?? null,
    onReported: (outcome, message) =>
      toast.show(
        outcome === "submitted"
          ? { title: "Report sent", description: "Whoever runs this server can see it." }
          : outcome === "already"
            ? { title: "You have already reported this" }
            : { title: "Report not sent", description: message },
      ),
  });

  /* Opening a thread is reading it. Watched, so a naming that lands while it is open clears too. */
  const unseen = host && id ? (threadMentions[host]?.[id]?.count ?? 0) : 0;
  useEffect(() => {
    if (!host || !id || !channelId || unseen === 0) return;
    markThreadMentionsRead(host, channelId, id);
  }, [host, id, channelId, unseen, markThreadMentionsRead]);

  /* A status change the server refused says so here; a refused fetch is drawn in the list. */
  useEffect(() => {
    if (!socket) return;
    const onError = (payload: unknown) => {
      if (!loading) toast.show({ title: errorText(payload) });
    };
    socket.on("thread:error", onError);
    return () => {
      socket.off("thread:error", onError);
    };
  }, [socket, loading, toast]);

  const typing = useTyping(socket, channelId ?? null, me?.serverUserId ?? null, id ?? null);
  const { messageLayout } = useAppearance();
  const reader = useThreadReader(host);

  const [held, setHeld] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const byId = useMemo(() => {
    const map = new Map(messages.map((m) => [m.message_id, m]));
    if (root) map.set(root.message_id, root);
    return map;
  }, [messages, root]);
  const heldMessage = held ? byId.get(held) : undefined;
  const abilities = heldMessage
    ? abilitiesFor(heldMessage, me?.serverUserId ?? null, isSystemMessage(heldMessage), mayHere)
    : { canReply: false, canReact: false, canEdit: false, canDelete: false, canCopy: false, canReport: false };
  // The root is answered in the channel, not in here, so only its replies take a reply.
  const heldAbilities = held && held === root?.message_id ? { ...abilities, canReply: false } : abilities;

  const rows = useMemo(() => groupMessages(messages).reverse(), [messages]);
  const rootRow = useMemo(() => (root ? groupMessages([root])[0] : null), [root]);

  const setStatus = useCallback(
    async (status: Status) => {
      const accessToken = await getAccessToken();
      if (!socket || !accessToken || !channelId || !id) return;
      socket.emit("thread:status:set", { conversationId: channelId, threadId: id, status, accessToken });
    },
    [socket, getAccessToken, channelId, id],
  );

  const title = thread?.title || "Thread";
  const canSetStatus = !!thread && maySetStatus(thread, me?.serverUserId ?? null, mayHere("manage_messages"));
  const open = thread ? takesReplies(thread) : true;

  const row = (item: (typeof rows)[number]) => (
    <MessageRow
      row={item}
      host={host}
      mentionable={mentionable}
      layout={messageLayout}
      me={me?.serverUserId ?? null}
      parent={item.message.reply_to_message_id ? byId.get(item.message.reply_to_message_id) : undefined}
      getAccessToken={getAccessToken}
      onRetry={retry}
      onDiscard={discard}
      onHold={setHeld}
      onToggleReaction={mayHere("add_reactions") ? react : undefined}
      showsPreviews={mayHere("use_link_previews")}
    />
  );

  const screen = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.color.bg }}
    >
      <ThreadHeader
        title={title}
        thread={thread}
        onSetStatus={canSetStatus && !gone ? (status) => void setStatus(status) : undefined}
      />
      <ConnectionNotice state={state} online={online} />

      {gone ? (
        <Gone why={gone} />
      ) : error ? (
        <Centered text={error} tone="danger" />
      ) : loading || !thread ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner color={theme.color.muted} />
        </View>
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(item) => item.message.message_id}
          renderItem={({ item }) => row(item)}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          // Inverted, so the header is the bottom of the list and the footer its top.
          ListHeaderComponent={
            rows.length === 0 && root ? (
              <Text style={{ color: theme.color.muted, fontSize: 14, padding: theme.space(4) }}>
                No replies yet. Start the conversation.
              </Text>
            ) : null
          }
          ListFooterComponent={
            <View>
              {loadingMore ? (
                <View style={{ paddingVertical: theme.space(4) }}>
                  <Spinner color={theme.color.muted} />
                </View>
              ) : null}
              <View
                style={{
                  borderBottomWidth: 1,
                  borderColor: theme.color.border,
                  paddingBottom: theme.space(2),
                  marginBottom: theme.space(1),
                }}
              >
                {rootRow ? (
                  row({ ...rootRow, dayLabel: null })
                ) : thread ? (
                  // Deleting the root takes the thread, but a blocked sender's is only hidden.
                  <Text style={{ color: theme.color.muted, fontSize: 14, padding: theme.space(4) }}>
                    The message this thread started from is gone.
                  </Text>
                ) : null}
              </View>
            </View>
          }
          contentContainerStyle={{ paddingVertical: theme.space(3) }}
        />
      )}

      {gone ? null : open ? (
        <>
          <TypingLine typers={typing.typers} />
          <Composer
            channel={channel?.name ?? ""}
            channelId={`${channelId ?? ""}/${id ?? ""}`}
            placeholder="Reply to thread…"
            onType={typing.type}
            onStopTyping={typing.stop}
            enabled={state.status === "ready" && online && !loading}
            mentionable={mentionable}
            channels={(state.status === "ready" ? state.channels : []).map((c) => c.name)}
            replyingTo={replyTo ? byId.get(replyTo) : undefined}
            onCancelReply={() => setReplyTo(null)}
            editing={editing ? byId.get(editing) : undefined}
            onCancelEdit={() => setEditing(null)}
            host={host}
            mayPost={mayHere("send_messages")}
            mayAttach={mayHere("attach_files")}
            getAccessToken={getAccessToken}
            sealFile={() => null}
            onSend={(text, files) => {
              if (editing) {
                edit(editing, text);
                setEditing(null);
                return;
              }
              send(text, replyTo, files);
              setReplyTo(null);
            }}
          />
        </>
      ) : (
        <ClosedLine />
      )}

      <MessageActions
        open={held !== null}
        onOpenChange={(next) => {
          if (!next) setHeld(null);
        }}
        abilities={heldAbilities}
        onReact={(src) => held && react(held, src)}
        onReply={() => {
          setEditing(null);
          setReplyTo(held);
        }}
        onCopy={() => {
          if (heldMessage?.text) void Clipboard.setStringAsync(heldMessage.text);
        }}
        onEdit={() => {
          setReplyTo(null);
          setEditing(held);
        }}
        onDelete={() => held && remove(held)}
        onReport={() => held && report(held)}
      />
    </KeyboardAvoidingView>
  );

  return <MentionReaderContext.Provider value={reader}>{screen}</MentionReaderContext.Provider>;
}

/** Who is reading, so a mention of you lights up the way it does in the channel. */
function useThreadReader(host: string): MentionReader {
  const { state, me } = useServerConnection();
  const suppressEveryone = useSuppressEveryone(host);
  const details = state.status === "ready" ? state.details : undefined;
  const channels = state.status === "ready" ? state.channels : undefined;
  return useMemo<MentionReader>(
    () => ({
      meId: me?.serverUserId ?? null,
      roleIds: details?.role_ids ?? (details?.role ? [details.role] : []),
      suppressEveryone,
      massAllowed: true,
      roles: new Map((details?.roles ?? []).map((r) => [r.id, { name: r.name ?? r.id, color: r.color ?? null }])),
      channelName: (channelId, onHost) =>
        !onHost || onHost === host ? (channels?.find((c) => c.id === channelId)?.name ?? null) : null,
      openChannel: (channelId, onHost) => {
        if (onHost && onHost !== host) return;
        router.push({ pathname: "/channel/[id]", params: { id: channelId } });
      },
    }),
    [me?.serverUserId, details, suppressEveryone, channels, host],
  );
}

/**
 * Back, the title, how many replies and what state it is in, and the status controls.
 * Mark solved or Reopen in reach, and Close topic in the menu, as on the desktop.
 */
function ThreadHeader({
  title,
  thread,
  onSetStatus,
}: {
  title: string;
  thread: ThreadSummary | null;
  /** Absent for somebody the server would refuse: only the author or a moderator. */
  onSetStatus?: (status: Status) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const present = useActionSheet();
  const open = thread ? takesReplies(thread) : true;

  const more = () => {
    void present({
      title,
      message: "Nothing is deleted, and you can open it again.",
      options: ["Close topic", "Cancel"],
      cancelButtonIndex: 1,
    }).then((index) => {
      if (index === 0) onSetStatus?.("closed");
    });
  };

  return (
    <View
      style={{
        paddingTop: insets.top + theme.space(1),
        paddingBottom: theme.space(2),
        paddingHorizontal: theme.space(2),
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        borderBottomWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
      }}
    >
      <RoundButton label="Back to the conversation" onPress={() => router.back()}>
        <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
      </RoundButton>

      <ChatsIcon size={18} color={theme.color.muted} weight="fill" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 17, fontWeight: "700" }}>
          {title}
        </Text>
        {thread ? (
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12 }}>
            {repliesLabel(thread.reply_count)}
            {thread.status === "solved" ? (
              <Text style={{ color: theme.color.accent, fontSize: 12 }}>{" · Solved"}</Text>
            ) : null}
            {!open ? " · Closed" : null}
          </Text>
        ) : null}
      </View>

      {onSetStatus && thread ? (
        thread.status !== "open" ? (
          <Button size="small" tone="neutral" onPress={() => onSetStatus("open")} accessibilityLabel="Reopen this topic">
            Reopen
          </Button>
        ) : (
          <Button
            size="small"
            onPress={() => onSetStatus("solved")}
            startIcon={<CheckIcon size={14} color={theme.color.onAccent} weight="bold" />}
            accessibilityLabel="Mark this topic solved"
          >
            Mark solved
          </Button>
        )
      ) : null}
      {onSetStatus && thread && thread.status !== "closed" ? (
        <RoundButton label="More for this topic" onPress={more}>
          <DotsThreeVerticalIcon size={20} color={theme.color.text} weight="bold" />
        </RoundButton>
      ) : null}
    </View>
  );
}

function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: theme.radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
      })}
    >
      {children}
    </Pressable>
  );
}

/** Where the composer would be on a closed thread. The server refuses a reply there. */
function ClosedLine() {
  const theme = useTheme();
  const tabBarSpace = useTabBarSpace();
  return (
    <Text
      style={{
        color: theme.color.muted,
        fontSize: 13,
        textAlign: "center",
        paddingHorizontal: theme.space(6),
        paddingTop: theme.space(3),
        paddingBottom: theme.space(3) + tabBarSpace,
      }}
    >
      This thread is closed, so you can’t reply to it. Nothing is deleted, and the author or a
      moderator can open it again.
    </Text>
  );
}

/** Deleted while it was open, or not there when asked: somebody else did it, somewhere else. */
function Gone({ why }: { why: NonNullable<ThreadGone> }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space(4), padding: theme.space(8) }}>
      <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21, textAlign: "center" }}>
        {why === "deleted" ? "This thread was deleted." : "That thread no longer exists."}
      </Text>
      <Button tone="neutral" onPress={() => router.back()}>
        Back to the conversation
      </Button>
    </View>
  );
}
