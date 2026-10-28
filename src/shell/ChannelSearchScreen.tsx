import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spinner, Text, TextField, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";
import { snippetParts, type SearchHit } from "./channelSearch";

/** Messages in one channel that match, newest first. A tap goes back to the channel at that message. */
export function ChannelSearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { socket, state } = useServerConnection();
  const { byId, avatarUrlFor } = useMembers();
  const channelName = state.status === "ready" ? state.channels.find((c) => c.id === id)?.name : undefined;

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const asked = useRef("");

  useEffect(() => {
    if (!socket) return;
    const onResults = (r: { requestId?: string; items?: SearchHit[]; total?: number; error?: string }) => {
      if (r.requestId !== asked.current) return;
      setFailed(!!r.error);
      setHits(r.items ?? []);
      setTotal(r.total ?? 0);
    };
    socket.on("chat:search:results", onResults);
    return () => {
      socket.off("chat:search:results", onResults);
    };
  }, [socket]);

  useEffect(() => {
    const term = query.trim();
    if (!socket || !id || !term) {
      asked.current = "";
      setHits(null);
      return;
    }
    // Asked once typing pauses: the server rate-limits search.
    const timer = setTimeout(() => {
      asked.current = `${Date.now()}`;
      socket.emit("chat:search", { query: term, conversationId: id, limit: 25, requestId: asked.current });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, socket, id]);

  const searching = !!query.trim() && hits === null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space(1) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2), paddingLeft: theme.space(2), paddingRight: theme.space(4), paddingBottom: theme.space(2) }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <CaretLeftIcon size={20} color={theme.color.accent} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={channelName ? `Search #${channelName}` : "Search this channel"}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search this channel"
          />
        </View>
      </View>

      {hits && hits.length > 0 ? (
        <Text style={{ color: theme.color.muted, fontSize: 13, paddingHorizontal: theme.space(5), paddingBottom: theme.space(2) }}>
          {total === 1 ? "1 result" : `${total} results`}
          {channelName ? ` in #${channelName}` : ""}
        </Text>
      ) : null}

      {searching ? (
        <View style={{ paddingTop: theme.space(6) }}>
          <Spinner color={theme.color.muted} />
        </View>
      ) : null}

      {hits && hits.length === 0 ? (
        <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center", padding: theme.space(8) }}>
          {failed ? "Search didn't work this time. Try again in a moment." : "Nothing here matches."}
        </Text>
      ) : null}

      <FlatList
        data={hits ?? []}
        keyExtractor={(h) => h.message_id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: theme.space(4), paddingBottom: insets.bottom + theme.space(4), gap: theme.space(2.5) }}
        renderItem={({ item }) => {
          const member = byId.get(item.sender_server_id);
          const name = member?.nickname || item.sender_display_name || "Someone";
          const when = new Date(item.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
          return (
            <Pressable
              onPress={() => router.dismissTo({ pathname: "/channel/[id]", params: { id: item.conversation_id, at: item.message_id } })}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: theme.space(3),
                padding: theme.space(3),
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
              })}
            >
              <PersonAvatar name={name} source={avatarUrlFor(member)} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.space(2) }}>
                  <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>{name}</Text>
                  <Text style={{ color: theme.color.muted, fontSize: 12 }}>{when}</Text>
                </View>
                <Text numberOfLines={3} style={{ color: theme.color.text, fontSize: 15, lineHeight: 21 }}>
                  {item.snippet
                    ? snippetParts(item.snippet).map((p, i) =>
                        p.hit ? (
                          <Text key={i} style={{ color: theme.color.accent, fontWeight: "700", backgroundColor: theme.alpha.accent[2] }}>
                            {p.text}
                          </Text>
                        ) : (
                          p.text
                        ),
                      )
                    : "Attachment"}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
