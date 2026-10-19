import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { ChatTeardropTextIcon } from "phosphor-react-native/src/icons/ChatTeardropText";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { avatarSource } from "../chat/files";
import type { ConversationEntry } from "../connection/AllConversationsProvider";
import { conversationTitle } from "../connection/directMessages";
import { ServerIcon } from "../servers/ServerIcon";
import { GroupFace } from "../shell/GroupFace";

/** 4:07, or 1:02:07 past the hour. */
export function callClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** The top of the call view (P6, P11): whose face, what it's called, where the chat is.
 * Props only: it renders inside `Sheet.Content`, which portals out of every provider. */
export function CallHeader({
  host,
  serverName,
  channelName,
  entry,
  since,
  unread = 0,
  onShrink,
  onChat,
}: {
  host: string;
  serverName: string;
  channelName: string;
  /** The conversation the call is in; absent for a server voice channel. */
  entry?: ConversationEntry;
  /** When the call connected; no clock until then. */
  since: number | null;
  /** Unread in the call's chat, as a count on the Chat pill. */
  unread?: number;
  onShrink: () => void;
  onChat: () => void;
}) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const server = { host };
  const title = entry ? conversationTitle(entry.conversation) : channelName;
  const green = theme.appearance === "light" ? theme.scales.success[10] : theme.scales.success[8];

  // No speaker icon by a server channel's name: the server's icon says where you are.
  const personFace = entry && entry.conversation.kind !== "group" ? (
    <PersonAvatar
      name={entry.conversation.other.nickname}
      source={entry.conversation.other.avatar_file_id ? avatarSource(server.host, entry.conversation.other.avatar_file_id) : null}
      size={34}
    />
  ) : (
    <ServerIcon host={server.host} name={serverName} size={34} />
  );
  const face = entry?.conversation.kind === "group" ? (
    <GroupFace host={server.host} conversation={entry.conversation} size={34} />
  ) : personFace;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 8, paddingRight: 12, paddingBottom: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Shrink the call"
        onPress={onShrink}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
      >
        <CaretDownIcon size={22} color={theme.color.text} />
      </Pressable>
      {face}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12 }}>
          {serverName}
          {since !== null ? (
            <Text style={{ color: green, fontSize: 12, fontVariant: ["tabular-nums"] }}> · {callClock(Math.max(0, Math.floor((now - since) / 1000)))}</Text>
          ) : null}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chat"
        onPress={onChat}
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
        <ChatTeardropTextIcon size={16} color={theme.color.text} />
        <Text style={{ color: theme.color.text, fontSize: 14 }}>Chat</Text>
        {unread > 0 ? (
          <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: theme.color.accent, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.color.onAccent, fontSize: 11, fontWeight: "700" }}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
