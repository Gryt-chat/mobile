import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";

import { UnreadPill } from "./ServerSwitcher";
import { useShell } from "./ShellContext";
import { CHANNELS, type Channel } from "./data";
import { VoiceSheet } from "../voice/VoiceSheet";

/**
 * The Server tab: a header that opens the switcher, and the channel list.
 *
 * The header is drawn rather than a native navigation bar, because it is the
 * one piece of chrome that is not generic — it carries the server icon, the
 * server name and the affordance that opens the switcher, and a `UINavigationBar`
 * title would have to be lied to for all three. The tab bar underneath is
 * native, which is where the brief asked for native.
 *
 * `paddingTop` from the safe area rather than a `SafeAreaView`, so the header's
 * background runs under the status bar instead of leaving a band above it.
 */
export function ServerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { server, setSwitcherOpen } = useShell();
  const [channelId, setChannelId] = useState(CHANNELS[0].id);
  const [inVoice, setInVoice] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <Pressable
        onPress={() => setSwitcherOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${server.name}. Switch server`}
        style={({ pressed }) => ({
          paddingTop: insets.top + theme.space(2),
          paddingBottom: theme.space(3),
          paddingHorizontal: theme.space(4),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
        })}
      >
        <Avatar name={server.initials} size="sm" />
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>
          {server.name}
        </Text>
        <CaretDownIcon size={18} color={theme.color.muted} weight="bold" />
      </Pressable>

      <ScrollView contentContainerStyle={{ padding: theme.space(3), gap: theme.space(1) }}>
        <SectionLabel>Text</SectionLabel>
        {CHANNELS.filter((c) => c.kind === "text").map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            active={c.id === channelId}
            onPress={() => setChannelId(c.id)}
          />
        ))}

        <SectionLabel style={{ marginTop: theme.space(4) }}>Voice</SectionLabel>
        {CHANNELS.filter((c) => c.kind === "voice").map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            active={c.id === inVoice}
            onPress={() => setInVoice(c.id)}
          />
        ))}
      </ScrollView>

      {/*
        Joining a voice channel opens the voice view as a sheet.

        Which is one answer to a question GRYT-398 left open — floating button,
        dragged from the bottom, from the side — and it is the smallest one:
        the row you tapped is already the thing you want to be in, so the sheet
        comes from it rather than from a control that has to live somewhere.
        It does not settle the question of how you get *back* to a call you have
        left the screen of, which is what a floating button would be for.
      */}
      <VoiceSheet channelId={inVoice} onClose={() => setInVoice(null)} />
    </View>
  );
}

function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: object;
}) {
  const theme = useTheme();

  return (
    <Text
      style={[
        {
          color: theme.color.muted,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          paddingHorizontal: theme.space(2),
          paddingBottom: theme.space(1),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function ChannelRow({
  channel,
  active,
  onPress,
}: {
  channel: Channel;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const Icon = channel.kind === "voice" ? SpeakerHighIcon : HashIcon;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        borderRadius: theme.radius.md,
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(2),
        backgroundColor: active
          ? theme.color.surfaceHover
          : pressed
            ? theme.color.surfaceRaised
            : "transparent",
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        <Icon
          size={18}
          color={active ? theme.color.text : theme.color.muted}
          weight={channel.kind === "voice" ? "fill" : "bold"}
        />
        <Text
          style={{
            color: active || channel.unread ? theme.color.text : theme.color.muted,
            fontSize: 16,
            fontWeight: channel.unread ? "700" : "500",
            flex: 1,
          }}
        >
          {channel.name}
        </Text>
        {channel.unread ? <UnreadPill count={channel.unread} /> : null}
      </View>

      {channel.inCall?.length ? (
        <View
          style={{
            flexDirection: "row",
            gap: theme.space(2),
            paddingLeft: theme.space(6),
            paddingTop: theme.space(1),
          }}
        >
          {channel.inCall.map((name) => (
            <View
              key={name}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Avatar name={name} size="xs" />
              <Text style={{ color: theme.color.muted, fontSize: 13 }}>{name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
