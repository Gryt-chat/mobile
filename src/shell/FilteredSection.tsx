import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";

import { useServerConnection } from "../connection/ConnectionsProvider";
import {
  admitConversation,
  clearFiltered,
  dismissFiltered,
  filteredSummary,
  type FilteredItem,
  useFilteredContacts,
} from "../connection/contactFilterStore";

/**
 * What this phone held back on this server against your contact settings (GRYT-1470).
 * Quiet on purpose: no badge, closed until tapped, and gone once it's empty.
 */
export function FilteredSection({ host }: { host: string | null }) {
  const theme = useTheme();
  const { socket, getAccessToken } = useServerConnection();
  const items = useFilteredContacts().filter((f) => f.host === host);
  const [expanded, setExpanded] = useState(false);
  if (!host || items.length === 0) return null;
  const Caret = expanded ? CaretDownIcon : CaretRightIcon;

  /* Its arrival was dropped, so ask for the list again before opening it. */
  const open = (item: FilteredItem) => {
    admitConversation(item.host, item.conversationId);
    dismissFiltered(item.host, item.conversationId);
    void getAccessToken().then((accessToken) => {
      if (accessToken) socket?.emit("dm:list", { accessToken });
    });
    router.push({ pathname: "/channel/[id]", params: { id: item.conversationId } });
  };

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Filtered, ${items.length}`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          paddingLeft: theme.space(4),
          paddingRight: theme.space(2),
          paddingTop: theme.space(4),
          paddingBottom: theme.space(1),
          backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
        })}
      >
        <Text style={{ color: theme.color.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
          Filtered
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 12 }}>{items.length}</Text>
        <Caret size={10} color={theme.color.muted} />
      </Pressable>

      {expanded ? (
        <View>
          <Text style={{ color: theme.color.muted, fontSize: 13, paddingHorizontal: theme.space(4), paddingVertical: theme.space(1) }}>
            Held back by your privacy settings. Nothing here made a sound or a badge.
          </Text>
          {items.map((item) => (
            <Pressable
              key={`${item.conversationId}|${item.kind}`}
              onPress={() => open(item)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: theme.space(4),
                paddingVertical: theme.space(2),
                backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
              })}
            >
              <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15 }}>
                {item.fromName || "Somebody"}
              </Text>
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
                {filteredSummary(item)}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => clearFiltered(host)}
            accessibilityRole="button"
            style={{ paddingHorizontal: theme.space(4), paddingVertical: theme.space(2) }}
          >
            <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>Clear</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
