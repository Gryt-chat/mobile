import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Pressable, View, type FlatList, type ViewToken } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";

import { isSystemMessage } from "../chat/system";
import { closeConversation, firstUnreadIndex, openConversation } from "../connection/unread";
import type { Row } from "./messageGroups";

const VIEWABILITY = { itemVisiblePercentThreshold: 50 };

/**
 * What was waiting when a conversation was opened, and a way back to the first of it.
 * Opening reads the count, so it is taken once here and held for the pill.
 */
export function useJumpToUnread(
  host: string,
  conversationId: string | null,
  /** Newest first, as the inverted list draws them. */
  rows: Row[],
  me: string | null,
  list: RefObject<FlatList<Row> | null>,
) {
  const [waiting, setWaiting] = useState(0);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    setWaiting(0);
    setSeen(false);
  }, [host, conversationId]);

  /* On focus rather than mount: coming back from a thread or another channel is
     looking at this one again, and nothing lands unread while it's on screen. */
  useFocusEffect(
    useCallback(() => {
      if (!host || !conversationId) return;
      const count = openConversation(host, conversationId);
      if (count > 0) {
        setWaiting(count);
        setSeen(false);
      }
      return () => closeConversation(host, conversationId);
    }, [host, conversationId]),
  );

  const index = useMemo(
    () =>
      firstUnreadIndex(
        rows.map((r) => ({
          sender_server_id: r.message.sender_server_id,
          pending: r.message.pending,
          system: isSystemMessage(r.message),
        })),
        waiting,
        me,
      ),
    [rows, waiting, me],
  );
  const firstUnreadId = index !== null ? rows[index].message.message_id : null;

  const firstRef = useRef(firstUnreadId);
  firstRef.current = firstUnreadId;
  // Stable, because FlatList refuses a new one after the first render.
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
    if (firstRef.current && viewableItems.some((v) => v.item?.message.message_id === firstRef.current)) {
      setSeen(true);
    }
  }).current;

  const jump = () => {
    // Not on the page yet: go to the oldest one held, which asks for the page before it.
    if (index === null) list.current?.scrollToEnd({ animated: true });
    else list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  };

  /* Rows are measured as they draw, so a far one needs a rough scroll first. */
  const onScrollToIndexFailed = (info: { index: number; averageItemLength: number }) => {
    list.current?.scrollToOffset({ offset: info.index * info.averageItemLength, animated: true });
    setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 300);
  };

  return {
    firstUnreadId,
    listProps: { onViewableItemsChanged, viewabilityConfig: VIEWABILITY, onScrollToIndexFailed },
    pill: waiting > 0 && !seen ? <JumpPill count={waiting} onPress={jump} /> : null,
  };
}

/**
 * Over the top of the list, where the first unread message is. A row of zero height
 * holds it, so the list under it does not move when it comes and goes.
 */
function JumpPill({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const label = count === 1 ? "1 new message" : `${count} new messages`;

  return (
    <View style={{ height: 0, zIndex: 1, elevation: 1, alignItems: "center" }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Jump to the first one`}
        hitSlop={6}
        style={({ pressed }) => ({
          position: "absolute",
          top: theme.space(2),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(1.5),
          paddingHorizontal: theme.space(3),
          paddingVertical: theme.space(1.5),
          borderRadius: theme.radius.full,
          backgroundColor: theme.color.accent,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <ArrowUpIcon size={14} color={theme.color.onAccent} weight="bold" />
        <Text style={{ color: theme.color.onAccent, fontSize: 13, fontWeight: "700" }}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** Above the first message that arrived while you were away. */
export function NewDivider() {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="New messages start here"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        paddingHorizontal: theme.space(4),
        paddingTop: theme.space(3),
        paddingBottom: theme.space(1),
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: theme.color.accent }} />
      <Text style={{ color: theme.color.accent, fontSize: 12, fontWeight: "700" }}>New</Text>
    </View>
  );
}
