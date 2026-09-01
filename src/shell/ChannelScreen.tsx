import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";

import { conversationIsGone } from "./channelGone";
import {
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spinner, Text, useTheme } from "@gryt/ui-native";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { ChatCircleIcon } from "phosphor-react-native/src/icons/ChatCircle";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { PhoneIcon } from "phosphor-react-native/src/icons/Phone";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import * as Clipboard from "expo-clipboard";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useCalls } from "../connection/CallsProvider";
import { useDirectMessages } from "../connection/DirectMessagesProvider";
import { useMembers } from "../connection/MembersProvider";
import { MessageActions } from "../chat/MessageActions";
import { Reactions, ReplyStub } from "../chat/Reactions";
import {
  abilitiesFor,
  quoteOf,
  summariseReactions,
  type MessageAbilities,
} from "../chat/messageAbilities";
import { useAppearance, type MessageLayout } from "../preferences/appearance";
import { useShell } from "./ShellContext";
import { useTabBarSpace } from "./TabBar";
import { useTwoPane } from "./twoPane";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { Attachments } from "../chat/Attachments";
import { MessageMarkdown } from "../chat/MessageMarkdown";
import { Suggestions } from "../chat/Suggestions";
import { complete, justClosedShortcode, queryAt, type Query } from "../chat/autocomplete";
import { unicodeFor } from "../chat/emoji";
import { blocksText, parseMarkdown } from "../chat/markdown";
import { attachmentUrl } from "../chat/files";
import { StagedAttachments } from "../chat/StagedAttachments";
import { MAX_ATTACHMENTS, pickedFrom, type Picked } from "../chat/staging";
import { TypingLine } from "../chat/TypingLine";
import { uploadAttachment } from "../chat/upload";
import { useTyping } from "../chat/useTyping";
import { shortChannelName } from "../chat/channelName";
import { isSystemMessage, resolveMentions } from "../chat/system";
import type { LocalMessage } from "../connection/outbox";
import type { ConnectionState } from "../connection/types";
import type { SealedAttachmentKey } from "@gryt/crypto";

import { forgetSealedAttachments } from "../chat/sealedAttachments";
import { sealedPlaceholder } from "../chat/sealedText";
import { sealingNotice } from "../chat/sealingNotice";
import { useConversationSealing } from "../connection/useConversationSealing";
import { useMessages } from "../connection/useMessages";
import { useRecents } from "../share/RecentsProvider";
import { groupMessages, type Row } from "./messageGroups";

/**
 * A text channel: what has been said in it.
 *
 * The list is inverted, which is why `loadOlder` hangs off `onEndReached` — in
 * an inverted list the "end" is the top, and the top is where older messages
 * go. It is worth the inversion: a chat that does not open at the newest
 * message is a chat you have to scroll before you can read it, and keeping the
 * bottom pinned as messages arrive is free this way rather than a scroll
 * calculation on every append. A message you send appears at the bottom for
 * the same reason, with no work.
 */
export function ChannelScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, socket, me, getAccessToken, online } = useServerConnection();
  /* Attachments are served by the server this channel belongs to, so the row
   * needs its address to build a URL. */
  const { server } = useShell();
  const host = server?.host ?? "";

  /* Who `@somebody` could be, worked out once for the whole list rather than
   * per row. Sorting is `applyMentions`'s job; this is only the names. */
  const { record } = useRecents();

  const { all } = useMembers();
  const mentionable = useMemo(
    () => all.map((member) => member.nickname).filter((name): name is string => Boolean(name)),
    [all],
  );

  const channel =
    state.status === "ready" ? state.channels.find((c) => c.id === id) : undefined;

  /**
   * The direct message being read, when this id is one.
   *
   * A DM reuses this screen — it is a conversation like any other once it
   * exists, and `useMessages` has always taken a conversation id rather than a
   * channel. What differs is the name, which is not in `state.channels`, and
   * the `#`, which is not what a person is called.
   */
  const directConversations = useDirectMessages().conversations;
  const direct = directConversations.find((c) => c.conversation_id === id);
  const isDirect = Boolean(direct);

  /**
   * Leave when the conversation stops existing for this person.
   *
   * A channel denied `read_messages` by its scope is not sent as locked — the
   * server stops sending it, so it drops out of `state.channels` mid-session
   * exactly as a deleted one does. Without this the screen stays open with the
   * raw conversation id as its title, since that is the last fallback in the
   * header, and every history request from then on is refused.
   *
   * `conversationIsGone` carries the conditions and the reasons they are there,
   * the load-bearing one being that a connection which is not ready has an
   * empty channel list for a completely different reason.
   */
  const gone = conversationIsGone({
    status: state.status,
    conversationId: id,
    channelIds: state.status === "ready" ? state.channels.map((c) => c.id) : [],
    directConversationIds: directConversations.map((c) => c.conversation_id),
  });

  useEffect(() => {
    if (!gone) return;
    // canGoBack first, because this screen is deep-linkable — a notification
    // or a shared link opens it with nothing behind it, and router.back() from
    // there does nothing at all, which would leave exactly the stuck screen
    // this exists to prevent.
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [gone]);
  const title = channel?.name ?? direct?.other.nickname ?? id ?? "";

  /**
   * Whether this conversation is encrypted, and the two operations (GRYT-729).
   *
   * `members` is null for a channel, which is what makes `decision` come back
   * as plaintext with nobody blocking it — a channel has no member list to seal
   * to and nothing has gone wrong.
   */
  const sealing = useConversationSealing({
    host,
    conversationId: id ?? null,
    myServerUserId: me?.serverUserId ?? null,
    members: direct?.members ?? null,
  });

  /**
   * Drop the decrypted attachments when this conversation goes away
   * (GRYT-761).
   *
   * They are plaintext copies of somebody's files in this app's cache. The OS
   * would clear it eventually under pressure, which is not the same as the app
   * deciding it no longer needs them.
   */
  useEffect(() => () => forgetSealedAttachments(), [id]);

  const notice = useMemo(
    () =>
      sealingNotice(
        sealing.decision,
        (memberId) =>
          direct?.members.find((m) => m.server_user_id === memberId)?.nickname,
      ),
    [sealing.decision, direct],
  );

  const { messages, loading, loadingMore, error, loadOlder, send, retry, discard, react, edit, remove } =
    useMessages(socket, id ?? null, {
      getAccessToken,
      me,
      seal: sealing.seal,
      open: sealing.open,
      openFile: sealing.openFile,
      host,
    });

  const typing = useTyping(socket, id ?? null, me?.serverUserId ?? null);
  const { messageLayout } = useAppearance();

  /**
   * The message being held, the one being answered, and the one being changed.
   *
   * Three ids rather than three messages. A message is replaced in place when
   * the server echoes an edit or a reaction back, so a held copy goes stale the
   * moment anybody reacts to it — the id is the part that does not move.
   */
  const [held, setHeld] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const byId = useMemo(() => new Map(messages.map((m) => [m.message_id, m])), [messages]);
  const heldMessage = held ? byId.get(held) : undefined;
  const abilities: MessageAbilities = heldMessage
    ? abilitiesFor(heldMessage, me?.serverUserId ?? null, isSystemMessage(heldMessage))
    : { canReply: false, canReact: false, canEdit: false, canDelete: false, canCopy: false };

  /* Dropped when the channel changes. A reply target from the channel you just
   * left would be sent to this one, where the server does not have it. */
  useEffect(() => {
    setHeld(null);
    setReplyTo(null);
    setEditing(null);
  }, [id]);

  // Newest first for an inverted list, so the array is reversed rather than the
  // grouping — which reads neighbours and has to see them in time order.
  const rows = useMemo(() => groupMessages(messages).reverse(), [messages]);

  return (
    <KeyboardAvoidingView
      // Android resizes the window itself, and adding padding on top of that
      // moves the composer twice as far as the keyboard.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.color.bg }}
    >
      <Header name={title} isDirect={isDirect} conversationId={isDirect ? (id ?? null) : null} />

      <ConnectionNotice state={state} online={online} />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner color={theme.color.muted} />
        </View>
      ) : error ? (
        <Centered text={error} tone="danger" />
      ) : rows.length === 0 ? (
        isDirect && direct ? (
          <DirectMessageWelcome
            nickname={direct.other.nickname}
            avatarUrl={
              host && direct.other.avatar_file_id
                ? attachmentUrl(host, direct.other.avatar_file_id)
                : null
            }
            serverName={server?.name ?? null}
          />
        ) : (
          <Centered text="No messages yet. Say something." />
        )
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(row) => row.message.message_id}
          renderItem={({ item }) => (
            <MessageRow
              row={item}
              host={host}
              mentionable={mentionable}
              layout={messageLayout}
              me={me?.serverUserId ?? null}
              parent={
                item.message.reply_to_message_id
                  ? byId.get(item.message.reply_to_message_id)
                  : undefined
              }
              onRetry={retry}
              onDiscard={discard}
              onHold={setHeld}
              onToggleReaction={react}
            />
          )}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          // Dismiss on a drag rather than a tap: a tap in the list is how you
          // reach a message, and taking the keyboard away instead is worse
          // than leaving it up.
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: theme.space(4) }}>
                <Spinner color={theme.color.muted} />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingVertical: theme.space(3) }}
        />
      )}

      {/* Above the composer and below the list, so what moves when it appears
          is the boundary between the two rather than the composer itself. */}
      <TypingLine typers={typing.typers} />

      {/* Whether this is going out in the open, next to the box being typed
          into (GRYT-729). The wording is in `sealingNotice` so it can be
          checked — it is the only thing that tells somebody their message is
          not private, and everything it can get wrong is quiet. */}
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            paddingHorizontal: theme.space(4),
            paddingBottom: theme.space(1),
            color: theme.color.muted,
            fontSize: 12,
          }}
        >
          {notice}
        </Text>
      ) : null}

      <Composer
        channel={title}
        isDirect={isDirect}
        channelId={id ?? ""}
        onType={typing.type}
        onStopTyping={typing.stop}
        enabled={state.status === "ready" && online}
        mentionable={mentionable}
        replyingTo={replyTo ? byId.get(replyTo) : undefined}
        onCancelReply={() => setReplyTo(null)}
        editing={editing ? byId.get(editing) : undefined}
        onCancelEdit={() => setEditing(null)}
        host={host}
        getAccessToken={getAccessToken}
        sealFile={sealing.sealFile}
        onSend={(text, files) => {
          if (editing) {
            edit(editing, text);
            setEditing(null);
            return;
          }
          send(text, replyTo, files);
          setReplyTo(null);
          /* Where you last spoke, for the share picker. On send rather than on
           * open, because opening a channel to read it says nothing about
           * where you would post — see `recents.ts`. */
          if (id) {
            record({
              host,
              channelId: id,
              channelName: channel?.name ?? id,
              serverName: server?.name ?? host,
            });
          }
        }}
      />

      <MessageActions
        open={held !== null}
        onOpenChange={(open) => {
          if (!open) setHeld(null);
        }}
        abilities={abilities}
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
      />
    </KeyboardAvoidingView>
  );
}

/**
 * A thin line saying what happened to the connection, rather than a screen.
 *
 * The messages above it were true a moment ago and are still worth reading, so
 * they stay. What must not stay is a composer that looks like it will send —
 * that is handled by `enabled` below, and this says why it is off.
 *
 * The refused and errored cases matter more than they look. Without them a
 * connection that was cut off mid-session leaves this screen looking ordinary:
 * the messages sit there, the field takes text, and the only hint is the
 * channel title quietly falling back to its id. Somebody types into a server
 * the app has decided it will not talk to.
 */
function ConnectionNotice({
  state,
  online,
}: {
  state: ConnectionState;
  online: boolean;
}) {
  /* `reason` is the machine code — `key_mismatch` and friends — and putting it
   * on screen tells the reader nothing. The same sentence the server screen
   * leads with is what belongs here. */
  if (state.status === "refused") return <Bar tone="danger" text="This is not the same server" />;
  if (state.status === "error") return <Bar tone="danger" text={state.message} />;
  // Before the channel has ever loaded, the spinner below says this already.
  if (!online && state.status === "ready") return <Bar spinner text="Reconnecting…" />;
  return null;
}

function Bar({
  text,
  tone,
  spinner,
}: {
  text: string;
  tone?: "danger";
  spinner?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space(2),
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(4),
        /* `dangerLight` is a light-theme tint and reads as a pink strip on this
         * background. The colour carrying the meaning is the text. */
        backgroundColor: theme.color.surfaceRaised,
        borderBottomWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      {spinner ? <Spinner size="small" color={theme.color.muted} /> : null}
      <Text
        numberOfLines={2}
        style={{
          color: tone === "danger" ? theme.color.danger : theme.color.muted,
          fontSize: 13,
          flexShrink: 1,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function Header({
  name,
  isDirect,
  conversationId,
}: {
  name: string;
  isDirect?: boolean;
  /** Set when this screen is a conversation, which is what can be called. */
  conversationId?: string | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { outgoing, ring, cancel } = useCalls();
  const { setVoiceChannel } = useShell();
  /* Beside the channel list there is nowhere to go back *to*: the list you
     would be returning to is already on screen, and `router.back()` lands on
     the empty "pick a channel" pane, which reads as the channel closing
     itself. */
  const twoPane = useTwoPane();

  const ringing = Boolean(conversationId) && outgoing?.conversation_id === conversationId;

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
      {twoPane ? null : (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
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
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
      )}

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
        {isDirect ? (
          <ChatCircleIcon size={18} color={theme.color.text} weight="bold" />
        ) : (
          <HashIcon size={18} color={theme.color.text} weight="bold" />
        )}
        {/* `flex: 1` as well as `numberOfLines`. Without it the text measures
            at its full width and runs past the row rather than truncating in
            it — the ellipsis only appears once something bounds the width. */}
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1, minWidth: 0 }}
        >
          {name}
        </Text>
      </View>

      {/* Only a conversation. A channel is always there and you join it from
          the list rather than by calling it.

          One button for both, because during your own ring the only thing you
          want is to stop it. Starting a call and joining one already going are
          the same act — the room is the room — so this does not need to know
          whether anybody is in there. */}
      {conversationId ? (
        <Pressable
          onPress={() => {
            if (ringing) {
              cancel(conversationId);
              return;
            }
            ring(conversationId);
            /* Joining your own call rather than waiting to be let in. The
               caller is in the room from the moment it rings, which is what
               makes answering it join something rather than open an empty
               one. */
            setVoiceChannel({ id: conversationId, name, type: "voice" });
          }}
          accessibilityRole="button"
          accessibilityLabel={ringing ? "Cancel the call" : "Start a call"}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ringing
              ? theme.color.accent
              : pressed
                ? theme.color.surfaceHover
                : theme.color.surfaceRaised,
          })}
        >
          {ringing ? (
            <PhoneDisconnectIcon size={20} color={theme.color.text} weight="fill" />
          ) : (
            <PhoneIcon size={20} color={theme.color.text} weight="fill" />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The first thing you see in a direct message with nobody in it yet.
 *
 * A line of grey text was what this had, and it read as an error state rather
 * than a beginning. The channel welcome on the web client sets the shape: who
 * you are talking to, then who can read it, then which server it belongs to.
 *
 * The middle line is the one that has to be here. On a self-hosted server a
 * direct message is stored by whoever runs it, the same as any channel, and
 * somebody who assumes otherwise has assumed something about their own
 * privacy that is not true.
 */
function DirectMessageWelcome({
  nickname,
  avatarUrl,
  serverName,
}: {
  nickname: string;
  avatarUrl: string | null;
  serverName: string | null;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: theme.space(8),
        gap: theme.space(3),
      }}
    >
      <PersonAvatar name={nickname} source={avatarUrl} size={64} variant="framed" />

      <Text
        numberOfLines={2}
        style={{
          color: theme.color.text,
          fontSize: 22,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        You and {nickname}.
      </Text>

      <Text
        style={{
          color: theme.color.muted,
          fontSize: 15,
          lineHeight: 21,
          textAlign: "center",
          maxWidth: 300,
        }}
      >
        Only the two of you can read this. Whoever runs the server can too.
      </Text>

      {/* Hairline and a smaller line, so the sentence about scope reads as a
          footnote to the two above rather than a third thing of equal weight.

          A fixed width rather than `alignSelf: "stretch"` with a max. Stretch
          opts the child out of the parent's `alignItems: "center"`, so the rule
          took its width from the left edge and sat visibly off-centre under
          text that was centred. */}
      <View
        style={{
          height: 1,
          width: 220,
          marginTop: theme.space(2),
          backgroundColor: theme.color.border,
        }}
      />

      <Text
        style={{
          color: theme.color.muted,
          fontSize: 12,
          lineHeight: 18,
          textAlign: "center",
          maxWidth: 280,
          opacity: 0.85,
        }}
      >
        This conversation is on {serverName ?? "this server"}. Messaging them on another
        server starts a separate one.
      </Text>
    </View>
  );
}

function Centered({ text, tone }: { text: string; tone?: "danger" }) {
  const theme = useTheme();
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(8) }}
    >
      <Text
        style={{
          color: tone === "danger" ? theme.color.danger : theme.color.muted,
          fontSize: 15,
          lineHeight: 21,
          textAlign: "center",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function MessageRow({
  row,
  host,
  mentionable,
  layout,
  me,
  parent,
  onRetry,
  onDiscard,
  onHold,
  onToggleReaction,
}: {
  row: Row;
  /** Where the attachments live. */
  host: string;
  /** Nicknames on this server, so `@somebody` lights up. */
  mentionable: string[];
  /** Which of the two shapes to draw. */
  layout: MessageLayout;
  /** Your server user id, so a reaction chip can say it is yours. */
  me: string | null;
  /** The message this one answers, when it is on the page. */
  parent: LocalMessage | undefined;
  onRetry: (nonce: string) => void;
  onDiscard: (nonce: string) => void;
  /** A hold opens the actions. The row asks; it does not act. */
  onHold: (messageId: string) => void;
  onToggleReaction: (messageId: string, src: string) => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { message, dayLabel, showHeader } = row;

  /* The server announces things in the same stream as people talk, under a
   * sender id of "system". Rendered as a person it arrives with an avatar and
   * whatever nickname the server's own enrichment settled on — which is
   * "Unknown", because there is no user called system to look up.
   *
   * The client calls it "System" and gives it no avatar. Same here. */
  const system = isSystemMessage(message);

  // The nickname is added by the server and can be absent; the id is the only
  // thing always there.
  const name = system ? "System" : message.sender_nickname || message.sender_server_id;

  /* Off the message rather than out of the member list, deliberately. The
   * server puts it there per message, so a message keeps the picture its sender
   * had — and it is the only answer for somebody who has since left, whom the
   * member list no longer contains at all. */
  const avatarUrl =
    !system && host && message.sender_avatar_file_id
      ? attachmentUrl(host, message.sender_avatar_file_id)
      : null;

  /* `[@You](mention:user_…)` is what the server writes into a join. Unwrapped
   * before the markdown sees it, so the line reads as a sentence rather than as
   * a link to a person there is nothing to open. */
  /* An envelope this device has not opened has no words to draw, and three of
   * the four states never will. Without this they are rows with a name, a time
   * and nothing between them (GRYT-729). */
  const placeholder = sealedPlaceholder(message);
  const text = placeholder
    ? placeholder
    : message.text && system
      ? resolveMentions(message.text)
      : message.text;
  /* The words without the marks, for the label a screen reader reads out. It
   * announced the asterisks before, which is the one place raw markdown is
   * worse than useless. */
  const spoken = text ? blocksText(parseMarkdown(text)) : null;
  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const reactions = summariseReactions(message.reactions, me);

  /**
   * Compact drops the avatar column, so the message gets the 52pt back.
   *
   * That is the whole difference in layout terms. Everything below — the reply
   * stub, the attachments, the reactions, the failure notice — is drawn the
   * same way in both and simply has more or less room to do it in.
   */
  const compact = layout === "compact";
  const gutter = compact ? 0 : 40 + theme.space(3);

  /* The `parent` may not be on the page: history loads a page at a time and a
   * reply to something older arrives long before the message it answers. The
   * stub still draws, saying "a message" — which is true, and better than
   * dropping the fact that this is a reply at all. */
  const answering = message.reply_to_message_id
    ? {
        author: parent
          ? isSystemMessage(parent)
            ? "System"
            : parent.sender_nickname || parent.sender_server_id
          : "Someone",
        quote: quoteOf(parent),
      }
    : null;

  const body = (
    <>
      {answering ? <ReplyStub author={answering.author} quote={answering.quote} /> : null}

      {showHeader ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: theme.space(2),
            paddingBottom: compact ? 2 : 0,
          }}
        >
          <Text
            numberOfLines={1}
            style={
              compact
                ? {
                    color: theme.color.text,
                    fontSize: 12.5,
                    fontWeight: "700",
                    letterSpacing: 0.7,
                    textTransform: "uppercase",
                  }
                : { color: theme.color.text, fontSize: 16, fontWeight: "700" }
            }
          >
            {name}
          </Text>
          <Text
            mono={compact}
            style={{ color: theme.color.muted, fontSize: compact ? 11 : 13 }}
          >
            {time}
          </Text>
        </View>
      ) : null}

      {text ? (
        <MessageMarkdown
          text={text}
          mentionable={mentionable}
          style={{
            /* Muted, because an announcement is context rather than
               conversation and should not compete with what people said. */
            color: system ? theme.color.muted : theme.color.text,
            fontSize: system ? 14 : compact ? 16.5 : 16,
            lineHeight: system ? 19 : compact ? 25 : 22,
          }}
        />
      ) : null}

      {/* A draft draws from the files on this phone, because the upload has only
          just started and the server has nothing to serve yet. The echo carries
          `enriched_attachments` and replaces the whole row, so this is the same
          picture twice rather than two different ones. */}
      {message.pending && message.attachments?.length ? (
        <View style={{ flexDirection: "row", gap: theme.space(2), marginTop: theme.space(1) }}>
          {message.attachments.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{
                width: 96,
                height: 96,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.surface,
              }}
              resizeMode="cover"
            />
          ))}
        </View>
      ) : null}

      {message.enriched_attachments?.length ? (
        /* Drawn, not counted. This said "1 attachment" where the picture
           would have gone.
           The width is what the row leaves after the gutter and the padding, so
           an image is sized before it loads rather than reflowing the list as
           each one lands. Compact has no gutter, so the picture is wider — the
           point of that layout. */
        <Attachments
          attachments={message.enriched_attachments}
          host={host}
          width={width - theme.space(4) * 2 - gutter}
        />
      ) : null}

      {message.edited_at ? (
        <Text style={{ color: theme.color.muted, fontSize: 12 }}>edited</Text>
      ) : null}

      <Reactions
        reactions={reactions}
        onToggle={(src) => onToggleReaction(message.message_id, src)}
      />

      {message.failed && message.nonce ? (
        <FailedNotice
          failure={message.failure}
          onRetry={() => onRetry(message.nonce!)}
          onDiscard={() => onDiscard(message.nonce!)}
        />
      ) : null}
    </>
  );

  return (
    <View>
      {/* Above the message, in source order and on screen.
       *
       * `inverted` reverses the order cells are laid out in; it does not turn
       * each cell upside down. This was written the other way round on the
       * assumption that it did, which put "Today" under the first message of
       * the day instead of over it — visible as a heading floating in the
       * middle of a day's messages rather than starting it. */}
      {dayLabel ? <DayDivider label={dayLabel} /> : null}

      {/*
        The hold is on the row rather than on the text, so the whole message is
        the target — including an attachment, which is often the thing you want
        to reply to. `delayLongPress` is left at the platform default: a shorter
        one starts firing during a scroll.

        No `onPress`. There is nothing a tap does to a message, and a Pressable
        that responds to one by doing nothing reads as broken.
      */}
      <Pressable
        onLongPress={() => onHold(message.message_id)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${time}. ${spoken ?? "attachment"}. Hold for actions`}
        style={({ pressed }) => ({
          flexDirection: "row",
          gap: compact ? 0 : theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingTop: showHeader ? theme.space(compact ? 3 : 2) : 0,
          paddingBottom: 2,
          backgroundColor: pressed ? theme.color.surface : "transparent",
          // Greyed while the server has not confirmed it. The message is
          // readable either way — this says "not yet", not "unimportant".
          opacity: message.pending ? 0.5 : 1,
        })}
      >
        {compact ? null : showHeader && !system ? (
          /* Their uploaded picture when there is one, and the face seeded on
             the nickname when there is not — which is what the desktop seeds
             on too, so one person is one face in both clients.

             `sender_avatar_file_id` is added by the server's `enrichMessages`
             and is not on the row, so a message can arrive without it. That is
             a fallback to the generated face rather than a blank, which is
             also what happens to every message sent before avatars existed.

             Never for the server: a face on an announcement makes it look like
             somebody said it. */
          <PersonAvatar name={name} source={avatarUrl} size={40} />
        ) : (
          // Keeps the text aligned under the block it continues.
          <View style={{ width: 40 }} />
        )}

        <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
      </Pressable>
    </View>
  );
}


/**
 * What a message that did not send says for itself.
 *
 * On its own row rather than as a toast, because the message is still on
 * screen and a notice somewhere else leaves you looking at a message with no
 * way to tell whether it arrived. Discard is offered next to Try again: a
 * message that will not send has to be removable, or the channel keeps a
 * permanent red mark on it.
 */
function FailedNotice({
  failure,
  onRetry,
  onDiscard,
}: {
  failure?: string;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: theme.space(2),
        paddingTop: 2,
      }}
    >
      <Text style={{ color: theme.color.danger, fontSize: 13 }}>
        {failure || "Not delivered."}
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
        {({ pressed }) => (
          <Text
            style={{
              color: theme.color.text,
              fontSize: 13,
              fontWeight: "700",
              opacity: pressed ? 0.6 : 1,
            }}
          >
            Try again
          </Text>
        )}
      </Pressable>
      <Pressable onPress={onDiscard} accessibilityRole="button" hitSlop={8}>
        {({ pressed }) => (
          <Text style={{ color: theme.color.muted, fontSize: 13, opacity: pressed ? 0.6 : 1 }}>
            Discard
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function DayDivider({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingHorizontal: theme.space(4),
        paddingTop: theme.space(4),
        paddingBottom: theme.space(1),
      }}
    >
      <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "700" }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.color.border }} />
    </View>
  );
}

/**
 * A rounded pill, floating over the page rather than welded to its bottom edge.
 *
 * It used to be a bordered box on a raised panel spanning the full width, with
 * the floating tab bar hovering over it — two different ideas of what sits at
 * the bottom of a screen, stacked. This is the one the rest of the app already
 * uses: the same radius language as the bar above it, inset from both edges,
 * with the page showing through beside it.
 *
 * The attach and voice-message buttons were here once and neither did anything
 * — no `onPress` at all, just a circle that dimmed under a finger. They have
 * not come back. The upload path still does not exist, and a control that
 * responds to a press and does nothing costs a tap to discover and then costs
 * trust in the send button beside it.
 *
 * Two bars can appear above the field, never both: what you are replying to,
 * or what you are editing. They are inside the pill rather than above it, so
 * the whole thing stays one object.
 */
function Composer({
  channel,
  isDirect,
  channelId,
  host,
  getAccessToken,
  sealFile,
  onSend,
  onType,
  onStopTyping,
  enabled,
  mentionable,
  replyingTo,
  onCancelReply,
  editing,
  onCancelEdit,
}: {
  channel: string;
  /** A person rather than a channel, so no `#` in front of the name. */
  isDirect?: boolean;
  /**
   * The id, where `channel` is the name.
   *
   * Both, because they are used for different things: the name goes in the
   * placeholder and the id is what a share was addressed to.
   */
  channelId: string;
  /** Where an attachment is uploaded to. */
  host: string;
  getAccessToken: () => Promise<string | null>;
  /**
   * Encrypt a file before it is uploaded, or answer null to send it as it is
   * (GRYT-761).
   *
   * Passed down rather than worked out here for the reason the notice above the
   * composer is: whether this conversation seals depends on every member's key,
   * and the two have to give the same answer or somebody is told their message
   * is private while its pictures are not.
   */
  sealFile: (
    bytes: Uint8Array,
    about?: { name?: string; mime?: string; width?: number; height?: number },
  ) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null;
  onSend: (
    text: string,
    files?: {
      ids: string[];
      localUris: string[];
      keys?: Record<string, SealedAttachmentKey> | null;
    } | null,
  ) => void;
  /** Every change to the field. Throttled by the hook, not here. */
  onType: () => void;
  /** Anything that ends the message: sending, blurring, giving up. */
  onStopTyping: () => void;
  enabled: boolean;
  /** Who `@` can offer. */
  mentionable: string[];
  /** The message being answered, when there is one. */
  replyingTo: LocalMessage | undefined;
  onCancelReply: () => void;
  /** The message being changed, when there is one. */
  editing: LocalMessage | undefined;
  onCancelEdit: () => void;
}) {
  const tabBarSpace = useTabBarSpace();
  const theme = useTheme();
  const { handoff, setHandoff } = useShell();
  const [text, setText] = useState("");
  /**
   * Where the caret is, which `onChangeText` does not say.
   *
   * `onSelectionChange` is the only source of it, and it fires *after* the
   * change — so the query is worked out from the selection rather than from
   * the text, and both are kept in step by recomputing on either.
   */
  const [caret, setCaret] = useState(0);
  const input = useRef<TextInput>(null);
  const keyboardUp = useKeyboardVisible();
  const body = text.trim();

  const query: Query | null = useMemo(() => queryAt(text, caret), [text, caret]);

  /**
   * What a picked shortcode should actually put in the field.
   *
   * The character for a standard one, which is what the desktop's editor does —
   * the composer then shows what the message will look like rather than its
   * source. A custom one stays as its shortcode: it is a picture on the server
   * and a `TextInput` cannot draw one inline. That is the one place this falls
   * short of the desktop, whose editor is a contenteditable and can hold an
   * `<img>`.
   */
  const renderedFor = (trigger: Query["trigger"], choice: string) =>
    trigger === ":" ? (unicodeFor(choice) ?? undefined) : undefined;

  const replace = (at: { text: string; caret: number }) => {
    setText(at.text);
    setCaret(at.caret);
    /* Told to the native field as well as to state. Without it the caret jumps
     * to the end of the message, which is only the same place when the
     * completion happened to be the last thing in it. */
    input.current?.setSelection(at.caret, at.caret);
  };

  const pick = (choice: string) => {
    const current = queryAt(text, caret);
    if (!current) return;
    replace(complete(text, current, choice, renderedFor(current.trigger, choice)));
  };

  /**
   * `:tada:` typed out by hand becomes 🎉 as the second colon lands.
   *
   * The other half of the same idea, and the one somebody who knows the name
   * will actually use — they never open the list at all. Only for a standard
   * name: a custom one has no character, so it stays as written and the message
   * draws the picture.
   */
  const onChange = (next: string) => {
    /* Only while there is something there. Clearing the field with backspace is
     * the opposite of typing, and announcing it would leave you "typing" an
     * empty message for eight seconds. */
    if (next.trim()) onType();
    else onStopTyping();

    const closed = justClosedShortcode(text, next);
    const character = closed ? unicodeFor(closed.name) : null;
    if (closed && character) {
      const replaced = next.slice(0, closed.start) + character + next.slice(closed.end);
      replace({ text: replaced, caret: closed.start + character.length });
      return;
    }
    setText(next);
  };

  /**
   * Editing loads the message into the field and focuses it.
   *
   * Keyed on the id rather than on the object: the message is replaced in place
   * whenever anybody reacts to it, and re-running this on a new object would
   * throw away whatever had been typed since.
   */
  const editingId = editing?.message_id ?? null;
  useEffect(() => {
    if (!editingId) return;
    setText(editing?.text ?? "");
    input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  /**
   * Picked, not yet uploaded.
   *
   * The upload happens on send, which is what makes taking one off the list
   * free — nothing has reached the server yet, so there is nothing to go and
   * delete.
   */
  const [staged, setStaged] = useState<Picked[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);

  /**
   * A share from another app, landing in the composer.
   *
   * The picker chose this channel and navigated here; this is the other end of
   * that. It fills the field and stages the files exactly as if they had been
   * typed and picked, so everything downstream — the upload, the failure
   * handling, the send — is the path every other message takes.
   *
   * **Taken once.** Clearing it is what stops the same photo being re-staged
   * every time this screen re-renders, and what makes going back and forward
   * between channels not carry it along.
   *
   * Whatever was already in the field wins over the share's text. A half-typed
   * message is somebody's work; a caption an app attached to a photo is not.
   */
  useEffect(() => {
    if (!handoff || handoff.channelId !== channelId) return;
    const { share } = handoff;
    setHandoff(null);
    setStaged((current) => [...current, ...share.files].slice(0, MAX_ATTACHMENTS));
    if (share.text) setText((current) => (current.trim() ? current : share.text ?? ""));
    input.current?.focus();
  }, [handoff, channelId, setHandoff]);

  const attach = async (from: "library" | "camera") => {
    setUploadProblem(null);
    const permission =
      from === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      /* The system asks once. After a refusal this is the only thing that
       * explains why the button did nothing — same reasoning as the avatar
       * picker, which hit this first. */
      setUploadProblem(
        from === "camera"
          ? "Camera access is off for Gryt. Turn it on in Settings."
          : "Photo access is off for Gryt. Turn it on in Settings.",
      );
      return;
    }

    const room = MAX_ATTACHMENTS - staged.length;
    if (room <= 0) return;

    const result =
      from === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images", "videos"],
            allowsMultipleSelection: true,
            selectionLimit: room,
            quality: 0.9,
          });

    if (result.canceled) return;
    setStaged((current) => [...current, ...result.assets.map(pickedFrom)].slice(0, MAX_ATTACHMENTS));
  };

  const submit = () => {
    if (!body && staged.length === 0) return;

    if (staged.length > 0) {
      void sendWithFiles();
      return;
    }

    onSend(body);
    onStopTyping();
    setText("");
    setCaret(0);
    /**
     * Emptying the state is not enough on iOS.
     *
     * A word the keyboard is still holding a correction for gets re-applied
     * after the value changes, so the message sends and the last word of it
     * reappears in a composer that should be empty. `clear()` goes through the
     * native field, which drops the pending correction with the text.
     */
    input.current?.clear();
  };

  /**
   * Upload, then send.
   *
   * In order rather than all at once: the route takes one file per request, and
   * four parallel uploads on a phone connection is four requests competing for
   * the same bandwidth and finishing no sooner. A failure stops the rest — the
   * ones already uploaded are orphaned, which is the cost of not having a
   * transaction, and is better than sending a message missing half its pictures.
   *
   * The composer stays as it is on failure, so the pictures are still staged
   * and the send can be pressed again. Nothing is lost.
   */
  const sendWithFiles = async () => {
    setUploading(true);
    setUploadProblem(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in to this server.");

      const ids: string[] = [];
      const keys: Record<string, SealedAttachmentKey> = {};
      for (const file of staged) {
        const { fileId, meta } = await uploadAttachment(host, token, file, undefined, sealFile);
        ids.push(fileId);
        // Keyed by the id the server assigned, which is only known now. The
        // bytes were bound to a value the package chose, so nothing had to be
        // agreed before the upload (GRYT-761).
        if (meta) keys[fileId] = meta;
      }

      onSend(body, {
        ids,
        localUris: staged.map((f) => f.uri),
        keys: Object.keys(keys).length > 0 ? keys : null,
      });
      onStopTyping();
      setText("");
      setCaret(0);
      setStaged([]);
      input.current?.clear();
    } catch (error) {
      setUploadProblem(error instanceof Error ? error.message : "That did not upload.");
    } finally {
      setUploading(false);
    }
  };

  const cancel = () => {
    if (editing) {
      onCancelEdit();
      setText("");
      input.current?.clear();
      return;
    }
    onCancelReply();
  };

  const context = editing
    ? { label: "Editing", quote: quoteOf(editing) }
    : replyingTo
      ? {
          label: `Replying to ${isSystemMessage(replyingTo) ? "System" : replyingTo.sender_nickname || replyingTo.sender_server_id}`,
          quote: quoteOf(replyingTo),
        }
      : null;

  return (
    <>
      <View style={{ paddingHorizontal: theme.space(3), paddingBottom: theme.space(2) }}>
        <View
          style={{
            borderRadius: theme.radius.xl,
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
            overflow: "hidden",
          }}
        >
          {context ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.space(2),
                paddingHorizontal: theme.space(4),
                paddingTop: theme.space(2),
                paddingBottom: theme.space(1),
              }}
            >
              <View
                style={{
                  width: 2,
                  alignSelf: "stretch",
                  borderRadius: 2,
                  backgroundColor: theme.color.accent,
                }}
              />
              <Text
                numberOfLines={1}
                style={{ color: theme.color.muted, fontSize: 12.5, flex: 1, minWidth: 0 }}
              >
                <Text style={{ color: theme.color.text, fontWeight: "600", fontSize: 12.5 }}>
                  {context.label}
                </Text>
                {"  "}
                {context.quote}
              </Text>
              <Pressable
                onPress={cancel}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={editing ? "Stop editing" : "Cancel reply"}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <XIcon size={15} color={theme.color.muted} weight="bold" />
              </Pressable>
            </View>
          ) : null}

          {/* Inside the pill and above the field, so the whole thing stays one
              object — the same reason the reply and edit bars are in here. */}
          <Suggestions query={query} people={mentionable} onPick={pick} />

          <StagedAttachments
            files={staged}
            busy={uploading}
            onRemove={(index) => setStaged((c) => c.filter((_, i) => i !== index))}
          />

          {uploadProblem ? (
            <Text
              style={{
                color: theme.color.danger,
                fontSize: 12.5,
                paddingHorizontal: theme.space(4),
                paddingTop: theme.space(2),
              }}
            >
              {uploadProblem}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: theme.space(2),
              paddingHorizontal: theme.space(2),
              paddingVertical: theme.space(2),
            }}
          >
            {/* Left of the field, and gone while editing: an edit changes the
                words on a message that already exists, and the server has no
                way to add a file to one. */}
            {editing ? null : (
              <Pressable
                onPress={() => void attach("library")}
                onLongPress={() => void attach("camera")}
                disabled={!enabled || uploading || staged.length >= MAX_ATTACHMENTS}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Attach a picture. Hold for the camera."
                style={({ pressed }) => ({
                  width: 36,
                  height: 36,
                  borderRadius: theme.radius.full,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity:
                    pressed || !enabled || uploading || staged.length >= MAX_ATTACHMENTS ? 0.4 : 1,
                })}
              >
                <PlusIcon size={20} color={theme.color.muted} weight="bold" />
              </Pressable>
            )}

            <TextInput
              ref={input}
              value={text}
              onChangeText={onChange}
              onSelectionChange={(event) => setCaret(event.nativeEvent.selection.start)}
              onBlur={onStopTyping}
              editable={enabled}
              /* Shortened, because the input is `multiline`: a long channel name
                 wraps the placeholder and the composer opens two lines tall. The
                 accessibility label below keeps the whole name — a screen reader
                 has no layout to break. */
              placeholder={
                editing
                  ? "Edit your message"
                  : `Message ${isDirect ? "" : "#"}${shortChannelName(channel)}`
              }
              placeholderTextColor={theme.color.muted}
              multiline
              // Return inserts a newline rather than sending. A phone keyboard has
              // one Return key and a chat message is often more than one line, so
              // sending is the button's job.
              blurOnSubmit={false}
              accessibilityLabel={
                editing ? "Edit your message" : `Message ${isDirect ? "" : "#"}${channel}`
              }
              style={{
                flex: 1,
                minWidth: 0,
                color: theme.color.text,
                fontSize: 16,
                lineHeight: 21,
                /* No border of its own. The pill around it is the edge, and a
                   second one inside it reads as a field inside a field. */
                paddingHorizontal: theme.space(3),
                // `paddingVertical` on a multiline field is ignored on Android, and
                // on iOS it is the only thing that centres a single line.
                paddingTop: theme.space(2),
                paddingBottom: theme.space(2),
                // Roughly six lines before it starts scrolling instead of growing.
                maxHeight: 140,
              }}
            />

            {body || staged.length > 0 ? (
              <Pressable
                onPress={submit}
                disabled={!enabled || uploading}
                accessibilityRole="button"
                accessibilityLabel={editing ? "Save" : "Send"}
                style={({ pressed }) => ({
                  width: 36,
                  height: 36,
                  borderRadius: theme.radius.full,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.color.accent,
                  opacity: pressed || !enabled ? 0.6 : 1,
                })}
              >
                {editing ? (
                  <CheckIcon size={20} color={theme.color.onAccent} weight="bold" />
                ) : (
                  <ArrowUpIcon size={20} color={theme.color.onAccent} weight="bold" />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/*
        Room for the floating tab bar, *outside* the composer's own surface.

        The bar draws over this rather than above it — the native bar it replaced
        was laid out above the content, so nothing had ever needed to reserve
        room and the composer vanished behind the new one the day it landed.

        Only while the keyboard is down. The keyboard covers the bar, so keeping
        the space open would leave a band of nothing between the field and the
        keys.
      */}
      <View pointerEvents="none" style={{ height: keyboardUp ? 0 : tabBarSpace }} />
    </>
  );
}


/**
 * Whether the keyboard is on screen.
 *
 * `KeyboardAvoidingView` moves the composer but says nothing about it, and the
 * padding under the composer depends on the answer. The iOS events fire before
 * the animation so the two move together; Android only has the `Did` pair.
 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
