import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, TextField, useTheme } from "@gryt/ui-native";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";

import { useShell } from "./ShellContext";
import { SERVERS } from "./data";

/**
 * Search, across every server rather than the active one.
 *
 * The filters are the ones the brief lists — by server, by author, by hashtag,
 * by messages carrying files, images or video — as a row of chips, because on a
 * phone that is the only place a filter fits without a second screen.
 *
 * None of them do anything. There is no search endpoint yet, and the shape of
 * the results is what decides whether this row is right; putting fake results
 * behind it would settle that by accident.
 */

type Filter = { id: string; label: string };

const FILTERS: Filter[] = [
  { id: "server", label: "Server" },
  { id: "author", label: "From" },
  { id: "hashtag", label: "Hashtag" },
  { id: "files", label: "Has file" },
  { id: "images", label: "Has image" },
  { id: "video", label: "Has video" },
];

export function SearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { servers } = useShell();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string[]>([]);

  const scope = useMemo(
    () => (active.includes("server") ? servers[0].name : `all ${SERVERS.length} servers`),
    [active, servers],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(2),
          paddingBottom: theme.space(3),
          paddingHorizontal: theme.space(4),
          gap: theme.space(3),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search every server"
          accessibilityLabel="Search every server"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: theme.space(2) }}>
            {FILTERS.map((f) => {
              const on = active.includes(f.id);
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() =>
                    setActive((current) =>
                      on ? current.filter((id) => id !== f.id) : [...current, f.id],
                    )
                  }
                  style={{
                    paddingHorizontal: theme.space(3),
                    paddingVertical: theme.space(2),
                    borderRadius: theme.radius.full,
                    borderWidth: 1,
                    borderColor: on ? theme.color.accent : theme.color.border,
                    backgroundColor: on ? theme.color.accent : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: on ? theme.color.onAccent : theme.color.muted,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.space(8),
          gap: theme.space(3),
        }}
      >
        <MagnifyingGlassIcon size={40} color={theme.color.muted} weight="bold" />
        <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>
          {query ? `Nothing for "${query}" yet` : "Search across your servers"}
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center" }}>
          Searching {scope}. Nothing is wired to a server yet, so this finds nothing.
        </Text>
        <View style={{ flexDirection: "row", gap: theme.space(2), paddingTop: theme.space(2) }}>
          {servers.map((s) => (
            <Avatar key={s.id} name={s.initials} size="sm" />
          ))}
        </View>
      </View>
    </View>
  );
}
