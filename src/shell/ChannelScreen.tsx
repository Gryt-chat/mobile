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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useServerConnection } from "../connection/ConnectionProvider";
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
  const { state, socket, me, getAccessToken } = useServerConnection();

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
            <MessageRow row={item} onRetry={retry} onDiscard={discard} />
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
        enabled={state.status === "ready"}
      />
    </KeyboardAvoidingView>
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Join voice"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: theme.radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
        })}
      >
        <HeadphonesIcon size={20} color={theme.color.text} />
      </Pressable>
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
  onRetry,
  onDiscard,
}: {
  row: Row;
  onRetry: (nonce: string) => void;
  onDiscard: (nonce: string) => void;
}) {
  const theme = useTheme();
  const { message, dayLabel, showHeader } = row;

  // The nickname is added by the server and can be absent; the id is the only
  // thing always there.
  const name = message.sender_nickname || message.sender_server_id;
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
        {showHeader ? (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.surfaceRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>
              {name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
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

          {message.text ? (
            <Text style={{ color: theme.color.text, fontSize: 16, lineHeight: 22 }}>
              {message.text}
            </Text>
          ) : null}

          {message.enriched_attachments?.length ? (
            <Text style={{ color: theme.color.muted, fontSize: 13, paddingTop: 2 }}>
              {message.enriched_attachments.length === 1
                ? message.enriched_attachments[0].original_name || "1 attachment"
                : `${message.enriched_attachments.length} attachments`}
            </Text>
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
   * The bottom inset here is the tab bar, not the home indicator.
   *
   * `NativeTabsView` mounts its own `SafeAreaProvider` around a tab's content,
   * so inside a tab screen `useSafeAreaInsets` reports the frame the bar leaves
   * rather than the window's. On iOS 26 the bar floats over the content, and
   * without this the composer sits underneath it.
   *
   * With the keyboard up it has to go: the keyboard covers the bar, so keeping
   * its inset leaves a band of empty surface between the field and the keys.
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: theme.space(2),
        paddingHorizontal: theme.space(3),
        paddingTop: theme.space(2),
        paddingBottom: theme.space(2) + (keyboardUp ? 0 : insets.bottom),
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
