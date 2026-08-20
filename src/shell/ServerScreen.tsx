import { useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { CaretUpIcon } from "phosphor-react-native/src/icons/CaretUp";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";
import { TrayIcon } from "phosphor-react-native/src/icons/Tray";

import { ServerHeader } from "./ServerHeader";
import { UnreadPill } from "./ServerSwitcher";
import { useShell } from "./ShellContext";
import { GROUPS, type Channel, type ChannelGroup } from "./data";
import { VoiceSheet } from "../voice/VoiceSheet";

/**
 * The Server tab: the coloured header, a row of cards, and the channel list.
 *
 * The cards are the reference's, cut to what Gryt has. Slack shows four —
 * Catch up, Threads, Huddles, Later — and three of those are Slack features.
 * Unread and who-is-in-a-call are things this server already knows, so those
 * are the two. A card for a feature that does not exist would look like a
 * feature that is broken.
 */
export function ServerScreen() {
  const theme = useTheme();
  const [inVoice, setInVoice] = useState<string | null>(null);

  const unread = GROUPS.flatMap((g) => g.channels).reduce((n, c) => n + (c.unread ?? 0), 0);
  const live = GROUPS.flatMap((g) => g.channels).reduce((n, c) => n + (c.inCall?.length ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ServerHeader />

      <ScrollView contentContainerStyle={{ paddingBottom: theme.space(6) }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            padding: theme.space(3),
            gap: theme.space(2),
          }}
        >
          <QuickCard
            icon={<TrayIcon size={22} color={theme.color.text} />}
            label="Catch up"
            detail={unread ? `${unread} new` : "Nothing new"}
          />
          <QuickCard
            icon={<HeadphonesIcon size={22} color={theme.color.text} />}
            label="Voice"
            detail={live ? `${live} in a call` : "Nobody in a call"}
          />
        </ScrollView>

        {GROUPS.map((group) => (
          <Group
            key={group.id}
            group={group}
            onOpen={(channel) => {
              if (channel.kind === "voice") setInVoice(channel.id);
              else router.push({ pathname: "/channel/[id]", params: { id: channel.id } });
            }}
            activeVoice={inVoice}
          />
        ))}
      </ScrollView>

      {/*
        Joining a voice channel opens the voice view as a sheet.

        Which is one answer to a question GRYT-398 left open — floating button,
        dragged from the bottom, from the side — and it is the smallest one: the
        row you tapped is already the thing you want to be in, so the sheet
        comes from it rather than from a control that has to live somewhere. It
        does not settle how you get back to a call whose screen you have left,
        which is what a floating button would be for.
      */}
      <VoiceSheet channelId={inVoice} onClose={() => setInVoice(null)} />
    </View>
  );
}

function QuickCard({
  icon,
  label,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={({ pressed }) => ({
        minWidth: 148,
        padding: theme.space(3),
        gap: theme.space(2),
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      {icon}
      <View>
        <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: theme.color.muted, fontSize: 14 }}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function Group({
  group,
  onOpen,
  activeVoice,
}: {
  group: ChannelGroup;
  onOpen: (channel: Channel) => void;
  activeVoice: string | null;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(true);

  return (
    <View style={{ borderTopWidth: 1, borderColor: theme.color.border }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          paddingVertical: theme.space(3),
          paddingHorizontal: theme.space(4),
          backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
        })}
      >
        <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "700", flex: 1 }}>
          {group.name}
        </Text>
        <CaretUpIcon
          size={18}
          color={theme.color.muted}
          weight="bold"
          style={{ transform: [{ rotate: open ? "0deg" : "180deg" }] }}
        />
      </Pressable>

      {open
        ? group.channels.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              active={c.id === activeVoice}
              onPress={() => onOpen(c)}
            />
          ))
        : null}
    </View>
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
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(4),
        backgroundColor: active
          ? theme.color.surfaceHover
          : pressed
            ? theme.color.surfaceRaised
            : "transparent",
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <Icon
          size={20}
          color={channel.unread ? theme.color.text : theme.color.muted}
          weight={channel.kind === "voice" ? "fill" : "bold"}
        />
        <Text
          style={{
            color: channel.unread ? theme.color.text : theme.color.muted,
            fontSize: 17,
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
            gap: theme.space(3),
            paddingLeft: theme.space(8),
            paddingTop: theme.space(1),
          }}
        >
          {channel.inCall.map((name) => (
            <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.color.surfaceRaised,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: theme.color.muted, fontSize: 10, fontWeight: "700" }}>
                  {name.slice(0, 1)}
                </Text>
              </View>
              <Text style={{ color: theme.color.muted, fontSize: 14 }}>{name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
