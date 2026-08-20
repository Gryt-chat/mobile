import { useLocalSearchParams, router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { CHANNEL_MEMBERS, GROUPS, MESSAGES, type Message } from "./data";

/**
 * A text channel: its messages, and a box to write one.
 *
 * Pushed over the tab bar rather than replacing it, which is what the Stack in
 * the root layout is for. The bar stays visible, so leaving a channel is the
 * back chevron and switching tabs is still one tap from here.
 *
 * Nothing sends. There is no socket, and a composer that clears its own input
 * and shows the message locally would be a convincing lie about a client that
 * cannot yet talk to a server.
 */
export function ChannelScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const channel = GROUPS.flatMap((g) => g.channels).find((c) => c.id === id);
  const name = channel?.name ?? id;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
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

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <HashIcon size={18} color={theme.color.text} weight="bold" />
            <Text
              numberOfLines={1}
              style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}
            >
              {name}
            </Text>
          </View>
          <Text style={{ color: theme.color.muted, fontSize: 13 }}>
            {CHANNEL_MEMBERS} members
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

      <ScrollView contentContainerStyle={{ paddingVertical: theme.space(3) }}>
        {MESSAGES.map((m) => (
          <MessageRow key={m.id} message={m} channel={name} />
        ))}
      </ScrollView>

      <Composer channel={name} />
    </View>
  );
}

function MessageRow({ message, channel }: { message: Message; channel: string }) {
  const theme = useTheme();

  return (
    <View>
      {message.day ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space(3),
            paddingHorizontal: theme.space(4),
            paddingTop: theme.space(4),
            paddingBottom: theme.space(2),
          }}
        >
          <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>
            {message.day}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.color.border }} />
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          gap: theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(2),
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radius.md,
            backgroundColor: message.color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>
            {message.author.slice(0, 1).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1, gap: theme.space(1) }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.space(2) }}>
            <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>
              {message.author}
            </Text>
            <Text style={{ color: theme.color.muted, fontSize: 13 }}>{message.time}</Text>
          </View>

          <Text
            style={{
              color: message.system ? theme.color.muted : theme.color.text,
              fontSize: 16,
              lineHeight: 22,
            }}
          >
            {message.system ? `${message.body.replace("#design", `#${channel}`)}` : message.body}
          </Text>

          {message.attachment ? (
            <View
              style={{
                marginTop: theme.space(1),
                height: 180,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: message.attachment.color,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: theme.color.muted, fontSize: 13 }}>
                {message.attachment.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
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
   *
   * That is the same mechanism the router's automatic content inset adjustment
   * uses for the first ScrollView in a screen — which is why the message list
   * needs nothing and this does.
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
