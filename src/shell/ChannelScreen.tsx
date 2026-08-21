import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useServerConnection } from "../connection/ConnectionProvider";
import { useShell } from "./ShellContext";
import { TAB_BAR_SPACE } from "./TabBar";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { Attachments } from "../chat/Attachments";
import { isSystemMessage, resolveMentions } from "../chat/system";
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

  const { messages, loading, loadingMore, error, loadOlder, send, retry, discard } =
    useMessages(socket, id ?? null, { getAccessToken, me });

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
          <ActivityIndicator color={theme.color.muted} />
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
            <MessageRow row={item} host={host} onRetry={retry} onDiscard={discard} />
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
                <ActivityIndicator color={theme.color.muted} />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingVertical: theme.space(3) }}
        />
      )}

      <Composer
        channel={channel?.name ?? id ?? ""}
        onSend={send}
        enabled={state.status === "ready" && online}
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
      {spinner ? <ActivityIndicator size="small" color={theme.color.muted} /> : null}
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
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}
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
  onRetry,
  onDiscard,
}: {
  row: Row;
  /** Where the attachments live. */
  host: string;
  onRetry: (nonce: string) => void;
  onDiscard: (nonce: string) => void;
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

  /* `[@You](mention:user_…)` is what the server writes into a join. Unwrapped
   * so the line reads as a sentence. Not markdown — that is its own job. */
  const text = message.text && system ? resolveMentions(message.text) : message.text;
  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

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

      <View
        style={{
          flexDirection: "row",
          gap: theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingTop: showHeader ? theme.space(2) : 0,
          paddingBottom: 2,
          // Greyed while the server has not confirmed it. The message is
          // readable either way — this says "not yet", not "unimportant".
          opacity: message.pending ? 0.5 : 1,
        }}
      >
        {showHeader && !system ? (
          /* The generated face, seeded on the nickname — which is what the
             desktop seeds on too, so one person is one face in both clients.
             An uploaded avatar wins when there is one; `sender_avatar_file_id`
             is on the message and is the next thing to wire here.

             Never for the server: a face on an announcement makes it look like
             somebody said it. */
          <PersonAvatar name={name} size={40} />
        ) : (
          // Keeps the text aligned under the block it continues.
          <View style={{ width: 40 }} />
        )}

        <View style={{ flex: 1 }}>
          {showHeader ? (
            <View
              style={{ flexDirection: "row", alignItems: "baseline", gap: theme.space(2) }}
            >
              <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>
                {name}
              </Text>
              <Text style={{ color: theme.color.muted, fontSize: 13 }}>{time}</Text>
            </View>
          ) : null}

          {text ? (
            <Text
              style={{
                /* Muted, because an announcement is context rather than
                   conversation and should not compete with what people said. */
                color: system ? theme.color.muted : theme.color.text,
                fontSize: system ? 14 : 16,
                lineHeight: system ? 19 : 22,
              }}
            >
              {text}
            </Text>
          ) : null}

          {message.enriched_attachments?.length ? (
            /* Drawn, not counted. This said "1 attachment" where the picture
               would have gone.
               The width is what the row leaves after the avatar and the
               padding, so an image is sized before it loads rather than
               reflowing the list as each one lands. */
            <Attachments
              attachments={message.enriched_attachments}
              host={host}
              width={width - theme.space(4) * 2 - 40 - theme.space(3)}
            />
          ) : null}

          {message.edited_at ? (
            <Text style={{ color: theme.color.muted, fontSize: 12 }}>edited</Text>
          ) : null}

          {message.failed && message.nonce ? (
            <FailedNotice
              failure={message.failure}
              onRetry={() => onRetry(message.nonce!)}
              onDiscard={() => onDiscard(message.nonce!)}
            />
          ) : null}
        </View>
      </View>
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
 * The one on the phone: a growing text field, and a send button that only
 * exists once there is something to send.
 *
 * The attach and voice-message buttons are still placeholders. They are left
 * in rather than removed because the row is theirs too, and a composer that
 * changes shape once uploads land is worse than one that is honest about
 * having controls that do not work yet.
 */
function Composer({
  channel,
  onSend,
  enabled,
}: {
  channel: string;
  onSend: (text: string) => void;
  enabled: boolean;
}) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const input = useRef<TextInput>(null);
  /**
   * The home indicator, which the bar clears and so must this.
   *
   * `TAB_BAR_SPACE` deliberately leaves the safe area out — screens add it
   * themselves, and a bar that included it would double it on every screen
   * that already had one.
   */
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();

  const body = text.trim();

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

  return (
    <>
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: theme.space(2),
        paddingHorizontal: theme.space(3),
        paddingVertical: theme.space(2),
        borderTopWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach"
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: theme.radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
        })}
      >
        <PlusIcon size={20} color={theme.color.text} weight="bold" />
      </Pressable>

      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        editable={enabled}
        placeholder={`Message #${channel}`}
        placeholderTextColor={theme.color.muted}
        multiline
        // Return inserts a newline rather than sending. A phone keyboard has
        // one Return key and a chat message is often more than one line, so
        // sending is the button's job.
        blurOnSubmit={false}
        accessibilityLabel={`Message #${channel}`}
        style={{
          flex: 1,
          color: theme.color.text,
          fontSize: 16,
          lineHeight: 21,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.color.border,
          paddingHorizontal: theme.space(4),
          // `paddingVertical` on a multiline field is ignored on Android, and
          // on iOS it is the only thing that centres a single line.
          paddingTop: theme.space(3),
          paddingBottom: theme.space(3),
          // Roughly six lines before it starts scrolling instead of growing.
          maxHeight: 140,
        }}
      />

      {body ? (
        <Pressable
          onPress={submit}
          disabled={!enabled}
          accessibilityRole="button"
          accessibilityLabel="Send"
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
          <ArrowUpIcon size={20} color={theme.color.onAccent} weight="bold" />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voice message"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <MicrophoneIcon size={20} color={theme.color.muted} weight="fill" />
        </Pressable>
      )}
    </View>

    {/*
      Room for the floating tab bar, *outside* the composer's own surface.

      The bar draws over this rather than above it — the native bar it replaced
      was laid out above the content, so nothing had ever needed to reserve
      room and the composer vanished behind the new one the day it landed.

      The reservation used to be padding on the composer itself, which put the
      bar inside a raised panel: a bar welded into a toolbar rather than a pill
      floating over a page, which is the entire shape. An empty box under the
      composer leaves the page showing through instead.

      Only while the keyboard is down. The keyboard covers the bar, so keeping
      the space open would leave a band of nothing between the field and the
      keys.
    */}
    <View
      pointerEvents="none"
      style={{ height: keyboardUp ? 0 : insets.bottom + TAB_BAR_SPACE }}
    />
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
