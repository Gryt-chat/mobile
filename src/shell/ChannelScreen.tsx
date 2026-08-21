import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useServerConnection } from "../connection/ConnectionProvider";
import { useMessages } from "../connection/useMessages";
import type { Message } from "../connection/types";
import { groupMessages, type Row } from "./messageGroups";

/**
 * A text channel: what has been said in it.
 *
 * The list is inverted, which is why `loadOlder` hangs off `onEndReached` — in
 * an inverted list the "end" is the top, and the top is where older messages
 * go. It is worth the inversion: a chat that does not open at the newest
 * message is a chat you have to scroll before you can read it, and keeping the
 * bottom pinned as messages arrive is free this way rather than a scroll
 * calculation on every append.
 *
 * Nothing sends yet. The composer is a placeholder, and `chat:send` needs the
 * access token in its payload — GRYT-421.
 */
export function ChannelScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, socket } = useServerConnection();

  const channel =
    state.status === "ready" ? state.channels.find((c) => c.id === id) : undefined;

  const { messages, loading, loadingMore, error, loadOlder } = useMessages(
    socket,
    id ?? null,
  );

  // Newest first for an inverted list, so the array is reversed rather than the
  // grouping — which reads neighbours and has to see them in time order.
  const rows = useMemo(() => groupMessages(messages).reverse(), [messages]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
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
          renderItem={({ item }) => <MessageRow row={item} />}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
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

      <Composer channel={channel?.name ?? id ?? ""} />
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

function MessageRow({ row }: { row: Row }) {
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
      <View
        style={{
          flexDirection: "row",
          gap: theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingTop: showHeader ? theme.space(2) : 0,
          paddingBottom: 2,
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
        </View>
      </View>

      {/* Below the message in source order, which puts it above in an inverted
          list — a day heading belongs at the top of its own day. */}
      {dayLabel ? <DayDivider label={dayLabel} /> : null}
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

function Composer({ channel }: { channel: string }) {
  const theme = useTheme();
  /**
   * The bottom inset here is the tab bar, not the home indicator.
   *
   * `NativeTabsView` mounts its own `SafeAreaProvider` around a tab's content,
   * so inside a tab screen `useSafeAreaInsets` reports the frame the bar leaves
   * rather than the window's. On iOS 26 the bar floats over the content, and
   * without this the composer sits underneath it.
   */
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        paddingHorizontal: theme.space(3),
        paddingTop: theme.space(2),
        paddingBottom: theme.space(2) + insets.bottom,
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

      <View
        style={{
          flex: 1,
          borderRadius: theme.radius.full,
          borderWidth: 1,
          borderColor: theme.color.border,
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(3),
        }}
      >
        <Text style={{ color: theme.color.muted, fontSize: 16 }}>Message #{channel}</Text>
      </View>

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
    </View>
  );
}
