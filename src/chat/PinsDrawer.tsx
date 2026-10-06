import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Drawer, Text, useTheme } from "@gryt/ui-native";
import type { Socket } from "socket.io-client";

import type { Message } from "../connection/types";

/**
 * A conversation's pinned messages, newest pin first (GRYT-1619). Asked for each time
 * it opens, and again when a pin changes while it is open.
 */
export function PinsDrawer({
  socket,
  conversationId,
  open,
  onOpenChange,
  nameOf,
  onPick,
}: {
  socket: Socket | null;
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nameOf: (serverUserId: string) => string;
  onPick: (messageId: string) => void;
}) {
  const theme = useTheme();
  const [items, setItems] = useState<Message[] | null>(null);

  useEffect(() => {
    if (!open || !socket || !conversationId) return;
    const ask = () => socket.emit("chat:pins", { conversationId });
    const onPins = (p: { conversation_id?: string; items?: Message[] }) => {
      if (p?.conversation_id === conversationId) setItems(Array.isArray(p.items) ? p.items : []);
    };
    const onPinned = (p: { conversation_id?: string }) => {
      if (p?.conversation_id === conversationId) ask();
    };
    setItems(null);
    socket.on("chat:pins", onPins);
    socket.on("chat:pinned", onPinned);
    ask();
    return () => {
      socket.off("chat:pins", onPins);
      socket.off("chat:pinned", onPinned);
    };
  }, [open, socket, conversationId]);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Popup side="bottom" size={0.6}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.color.text, paddingHorizontal: theme.space(4), paddingVertical: theme.space(2) }}>
            Pinned messages
          </Text>
          <Drawer.FlatList
            data={items ?? []}
            keyExtractor={(m: Message) => m.message_id}
            contentContainerStyle={{ paddingHorizontal: theme.space(2), paddingBottom: theme.space(6) }}
            renderItem={({ item }: { item: Message }) => (
              <Pressable
                onPress={() => {
                  onOpenChange(false);
                  onPick(item.message_id);
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  paddingVertical: theme.space(2),
                  paddingHorizontal: theme.space(2),
                  borderRadius: theme.radius.md,
                  backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
                })}
              >
                <View style={{ flexDirection: "row", gap: theme.space(2), alignItems: "baseline" }}>
                  <Text style={{ color: theme.color.text, fontWeight: "600", fontSize: 14 }}>{nameOf(item.sender_server_id)}</Text>
                  <Text style={{ color: theme.color.muted, fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
                <Text numberOfLines={3} style={{ color: theme.color.text, fontSize: 15 }}>
                  {item.text ?? (item.sealed ? "Encrypted message" : item.attachments?.length ? "Attachment" : "")}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ color: theme.color.muted, textAlign: "center", paddingTop: theme.space(6) }}>
                {items === null ? "Loading…" : "Nothing pinned yet. Hold a message and pick Pin."}
              </Text>
            }
          />
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
