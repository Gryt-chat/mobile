import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useAllConversations } from "../connection/AllConversationsProvider";
import { useConnections } from "../connection/ConnectionsProvider";
import { useUnread } from "../connection/unread";
import { ServerIcon } from "../servers/ServerIcon";
import { useSwitchServer } from "./lastChannel";
import { useShell } from "./ShellContext";
import { SERVER_RAIL_WIDTH } from "./twoPane";
import { UnreadPill } from "./UnreadPill";

/** Stops short of the time and wifi, which sit in the top right corner when held upright. */
const STATUS_ICONS_WIDTH = 130;
const ICON = 44;
/** Keeps the first icon out of the screen's rounded corner. */
const CORNER_CLEARANCE = 28;

/**
 * Your servers, always showing when open. A column sideways, and upright a row in the
 * status bar's band, which is otherwise empty. Closed keeps the switcher.
 */
export function ServerRail() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { servers, server, setAddServerOpen } = useShell();
  const switchServer = useSwitchServer();
  const unread = useUnread();
  const { mentions } = useConnections();
  const conversations = useAllConversations();
  // The rail counts channels, as on the desktop. Direct messages have the Messages tab's badge.
  const channelCount = (counts: Record<string, number> | undefined, host: string) => {
    const dms = new Set(conversations.filter((e) => e.host === host).map((e) => e.conversation.conversation_id));
    return Object.entries(counts ?? {}).reduce((sum, [id, n]) => (dms.has(id) ? sum : sum + n), 0);
  };
  const row = height > width;

  const items = (
    <>
      {servers.map((s) => (
        <Pressable
          key={s.host}
          onPress={() => switchServer(s.host)}
          accessibilityRole="tab"
          accessibilityState={{ selected: s.host === server?.host }}
          accessibilityLabel={s.name || s.host}
        >
          {/* As on the desktop: the server you're in is at full strength, the rest are dimmed. */}
          <ServerIcon host={s.host} name={s.name} size={ICON} style={{ opacity: s.host === server?.host ? 1 : 0.5 }} />
          <View pointerEvents="none" style={{ position: "absolute", right: -4, bottom: -4 }}>
            <UnreadPill count={channelCount(unread[s.host], s.host)} mentions={channelCount(mentions[s.host], s.host)} />
          </View>
        </Pressable>
      ))}
    </>
  );

  // Outside the scroller, so it stays in reach however many servers there are.
  const addServer = (
    <Pressable
      onPress={() => setAddServerOpen(true)}
      accessibilityRole="button"
      accessibilityLabel="Add a server"
      style={{
        width: ICON,
        height: ICON,
        borderRadius: ICON / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.color.surface,
      }}
    >
      <PlusIcon size={20} color={theme.color.text} />
    </Pressable>
  );

  if (row) {
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: STATUS_ICONS_WIDTH,
          height: insets.top,
          flexDirection: "row",
          alignItems: "center",
          paddingRight: theme.space(2),
        }}
      >
        <ScrollView
          style={{ flex: 1, alignSelf: "stretch" }}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            gap: theme.space(2),
            paddingLeft: CORNER_CLEARANCE,
            paddingRight: theme.space(2),
          }}
        >
          {items}
        </ScrollView>
        <View style={{ marginLeft: theme.space(2) }}>{addServer}</View>
      </View>
    );
  }

  return (
    <View
      style={{
        width: SERVER_RAIL_WIDTH,
        paddingTop: insets.top,
        borderRightWidth: 1,
        borderRightColor: theme.color.border,
      }}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: "center",
          gap: theme.space(2),
          paddingVertical: theme.space(3),
        }}
      >
        {items}
      </ScrollView>
      <View style={{ alignItems: "center", paddingVertical: theme.space(3) }}>{addServer}</View>
    </View>
  );
}
