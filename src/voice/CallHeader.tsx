import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { ChatCircleIcon } from "phosphor-react-native/src/icons/ChatCircle";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { avatarSource } from "../chat/files";
import { useAllConversations } from "../connection/AllConversationsProvider";
import { conversationTitle } from "../connection/directMessages";
import { ServerIcon } from "../servers/ServerIcon";
import { GroupFace } from "../shell/GroupFace";
import { useShell } from "../shell/ShellContext";

/** 4:07, or 1:02:07 past the hour. */
export function callClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The top of the one call view (P6, P11). Only this changes between a DM, a group and a
 * server's voice channel: whose face, what it's called, and where the chat is.
 */
export function CallHeader() {
  const theme = useTheme();
  const { server, servers, voiceChannel, setVoiceOpen } = useShell();
  const conversations = useAllConversations();
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!voiceChannel || !server) return null;

  const entry = conversations.find((e) => e.host === server.host && e.conversation.conversation_id === voiceChannel.id);
  const serverName = servers.find((s) => s.host === server.host)?.name ?? server.host;
  const title = entry ? conversationTitle(entry.conversation) : voiceChannel.name;
  const green = theme.appearance === "light" ? theme.scales.success[10] : theme.scales.success[8];

  // No speaker icon by a server channel's name: the server's icon says where you are.
  const face = entry?.conversation.kind === "group" ? (
    <GroupFace host={server.host} conversation={entry.conversation} size={34} />
  ) : entry ? (
    <PersonAvatar
      name={entry.conversation.other.nickname}
      source={entry.conversation.other.avatar_file_id ? avatarSource(server.host, entry.conversation.other.avatar_file_id) : null}
      size={34}
    />
  ) : (
    <ServerIcon host={server.host} name={serverName} size={34} />
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 8, paddingRight: 12, paddingBottom: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Shrink the call"
        onPress={() => setVoiceOpen(false)}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
      >
        <CaretDownIcon size={22} color={theme.color.text} />
      </Pressable>
      {face}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12 }}>
          {serverName} · <Text style={{ color: green, fontSize: 12, fontVariant: ["tabular-nums"] }}>{callClock(Math.floor((now - since) / 1000))}</Text>
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chat"
        onPress={() => {
          setVoiceOpen(false);
          router.push({ pathname: "/channel/[id]", params: { id: voiceChannel.id } });
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          height: 36,
          paddingHorizontal: 14,
          borderRadius: 18,
          backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
        })}
      >
        <ChatCircleIcon size={16} color={theme.color.text} />
        <Text style={{ color: theme.color.text, fontSize: 14 }}>Chat</Text>
      </Pressable>
    </View>
  );
}
