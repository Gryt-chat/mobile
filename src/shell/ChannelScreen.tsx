import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
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
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { XIcon } from "phosphor-react-native/src/icons/X";

import * as Clipboard from "expo-clipboard";

import { useServerConnection } from "../connection/ConnectionsProvider";
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
import { TAB_BAR_SPACE } from "./TabBar";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { Attachments } from "../chat/Attachments";
import { attachmentUrl } from "../chat/files";
import { shortChannelName } from "../chat/channelName";
import { isSystemMessage, resolveMentions } from "../chat/system";
import type { LocalMessage } from "../connection/outbox";
import type { ConnectionState } from "../connection/types";
import { useMessages } from "../connection/useMessages";
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

  const channel =
    state.status === "ready" ? state.channels.find((c) => c.id === id) : undefined;

  const { messages, loading, loadingMore, error, loadOlder, send, retry, discard, react, edit, remove } =
    useMessages(socket, id ?? null, { getAccessToken, me });
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
      <Header name={channel?.name ?? id ?? ""} />

      <ConnectionNotice state={state} online={online} />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner color={theme.color.muted} />
        </View>
      ) : error ? (
        <Centered text={error} tone="danger" />
      ) : rows.length === 0 ? (
        <Centered text="No messages yet. Say something." />
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(row) => row.message.message_id}
          renderItem={({ item }) => (
            <MessageRow
              row={item}
              host={host}
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

      <Composer
        channel={channel?.name ?? id ?? ""}
        enabled={state.status === "ready" && online}
        replyingTo={replyTo ? byId.get(replyTo) : undefined}
        onCancelReply={() => setReplyTo(null)}
        editing={editing ? byId.get(editing) : undefined}
        onCancelEdit={() => setEditing(null)}
        onSend={(text) => {
          if (editing) {
            edit(editing, text);
            setEditing(null);
            return;
          }
          send(text, replyTo);
          setReplyTo(null);
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

function Header({ name }: { name: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <HashIcon size={18} color={theme.color.text} weight="bold" />
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
   * so the line reads as a sentence. Not markdown — that is its own job. */
  const text = message.text && system ? resolveMentions(message.text) : message.text;
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
        <Text
          style={{
            /* Muted, because an announcement is context rather than
               conversation and should not compete with what people said. */
            color: system ? theme.color.muted : theme.color.text,
            fontSize: system ? 14 : compact ? 16.5 : 16,
            lineHeight: system ? 19 : compact ? 25 : 22,
          }}
        >
          {text}
        </Text>
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
        accessibilityLabel={`${name}, ${time}. ${text ?? "attachment"}. Hold for actions`}
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
  onSend,
  enabled,
  replyingTo,
  onCancelReply,
  editing,
  onCancelEdit,
}: {
  channel: string;
  onSend: (text: string) => void;
  enabled: boolean;
  /** The message being answered, when there is one. */
  replyingTo: LocalMessage | undefined;
  onCancelReply: () => void;
  /** The message being changed, when there is one. */
  editing: LocalMessage | undefined;
  onCancelEdit: () => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const input = useRef<TextInput>(null);
  const keyboardUp = useKeyboardVisible();
  const body = text.trim();

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

  const submit = () => {
    if (!body) return;
    onSend(body);
    setText("");
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

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: theme.space(2),
              paddingHorizontal: theme.space(2),
              paddingVertical: theme.space(2),
            }}
          >
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              editable={enabled}
              /* Shortened, because the input is `multiline`: a long channel name
                 wraps the placeholder and the composer opens two lines tall. The
                 accessibility label below keeps the whole name — a screen reader
                 has no layout to break. */
              placeholder={editing ? "Edit your message" : `Message #${shortChannelName(channel)}`}
              placeholderTextColor={theme.color.muted}
              multiline
              // Return inserts a newline rather than sending. A phone keyboard has
              // one Return key and a chat message is often more than one line, so
              // sending is the button's job.
              blurOnSubmit={false}
              accessibilityLabel={editing ? "Edit your message" : `Message #${channel}`}
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

            {body ? (
              <Pressable
                onPress={submit}
                disabled={!enabled}
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
      <View pointerEvents="none" style={{ height: keyboardUp ? 0 : TAB_BAR_SPACE }} />
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
