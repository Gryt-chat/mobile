import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

/**
 * A text channel: its messages, and a box to write one.
 *
 * Nothing reaches this yet — there are no channels to tap, because channels
 * come over the socket. The screen is kept, with its fixtures removed, because
 * its arrangement is the part that was reviewed: pushed inside the Server tab's
 * own Stack so the bar stays visible, its own header with a member count, a
 * composer that takes its bottom inset from the tab bar.
 *
 * Nothing sends, and nothing pretends to. A composer that cleared its input and
 * showed the message locally would be a convincing lie about a client that
 * cannot talk to a server.
 */
export function ChannelScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

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

        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <HashIcon size={18} color={theme.color.text} weight="bold" />
          <Text
            numberOfLines={1}
            style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}
          >
            {id}
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

      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 15,
            textAlign: "center",
            padding: theme.space(8),
          }}
        >
          No messages. Nothing is wired to a server yet.
        </Text>
      </ScrollView>

      <Composer channel={id ?? ""} />
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
