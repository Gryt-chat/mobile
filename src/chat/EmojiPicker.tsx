import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Drawer, Text, TextField, useTheme } from "@gryt/ui-native";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { useCustomEmojis } from "./CustomEmojiProvider";
import {
  CATEGORY_ICONS,
  getStandardEmojisByCategory,
  reactionSrcFor,
  searchEmojis,
  type EmojiEntry,
} from "./emojiCategories";
import { getRecentReactions, recordReaction } from "./recentReactions";

const COLS = 7;
const CELL = 40;

type Row = { kind: "header"; label: string } | { kind: "cells"; cells: EmojiEntry[] };

function toRows(sections: { label: string; entries: EmojiEntry[] }[]): Row[] {
  const rows: Row[] = [];
  for (const section of sections) {
    if (section.entries.length === 0) continue;
    rows.push({ kind: "header", label: section.label });
    for (let i = 0; i < section.entries.length; i += COLS) rows.push({ kind: "cells", cells: section.entries.slice(i, i + COLS) });
  }
  return rows;
}

/**
 * Every emoji this server offers — standard and custom — with the desktop picker's own
 * categories, search and recent list. Reactions only; text still takes `:shortcode:`.
 */
export function EmojiPicker({
  open,
  onOpenChange,
  onSelect,
  serverHost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (src: string) => void;
  serverHost?: string;
}) {
  const theme = useTheme();
  const customMap = useCustomEmojis();
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  /* Reloaded on every open rather than kept live: a reaction picked a minute ago
   * belongs at the front the next time this opens, not mid-session. */
  useEffect(() => {
    if (!open) return;
    setSearch("");
    let cancelled = false;
    void getRecentReactions(16, serverHost).then((r) => {
      if (!cancelled) setRecent(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, serverHost]);

  const customEntries = useMemo<EmojiEntry[]>(
    () => [...customMap.entries()].map(([name, url]) => ({ name, emoji: null, isCustom: true, url, tags: [], aliases: [] })),
    [customMap],
  );
  const standardByCategory = getStandardEmojisByCategory();

  const recentEntries = useMemo<EmojiEntry[]>(() => {
    const all = [...customEntries, ...[...standardByCategory.values()].flat()];
    return recent
      .map((src) =>
        src.startsWith(":") && src.endsWith(":")
          ? all.find((e) => e.isCustom && e.name === src.slice(1, -1))
          : all.find((e) => !e.isCustom && e.emoji === src),
      )
      .filter((e): e is EmojiEntry => e !== undefined);
  }, [recent, customEntries, standardByCategory]);

  const results = search.trim() ? searchEmojis(search, customEntries) : null;

  const rows = useMemo<Row[]>(() => {
    if (results) return toRows([{ label: "Results", entries: results }]);
    return toRows([
      { label: "Recently Used", entries: recentEntries },
      { label: "Custom", entries: customEntries },
      ...[...standardByCategory.entries()].map(([label, entries]) => ({ label, entries })),
    ]);
  }, [results, recentEntries, customEntries, standardByCategory]);

  const pick = (entry: EmojiEntry) => {
    const src = reactionSrcFor(entry);
    void recordReaction(src, serverHost);
    onSelect(src);
    onOpenChange(false);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Popup side="bottom" size={0.78}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: theme.space(3),
              paddingBottom: theme.space(2),
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: theme.color.text }}>React with</Text>
            <Pressable onPress={() => onOpenChange(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
              <XIcon size={18} color={theme.color.muted} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: theme.space(3), paddingBottom: theme.space(2) }}>
            <TextField
              value={search}
              onChangeText={setSearch}
              placeholder="Search emoji"
              size="small"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <Drawer.FlatList
            data={rows}
            keyExtractor={(_: Row, i: number) => String(i)}
            contentContainerStyle={{ paddingHorizontal: theme.space(3), paddingBottom: theme.space(5) }}
            renderItem={({ item }: { item: Row }) =>
              item.kind === "header" ? (
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: theme.color.muted,
                    paddingTop: theme.space(2),
                    paddingBottom: theme.space(1),
                  }}
                >
                  {`${CATEGORY_ICONS[item.label] ?? ""} ${item.label}`}
                </Text>
              ) : (
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {item.cells.map((entry, i) => (
                    <EmojiCell key={`${entry.isCustom ? "c" : "s"}:${entry.name}-${i}`} entry={entry} onPress={pick} />
                  ))}
                </View>
              )
            }
            ListEmptyComponent={
              results ? (
                <Text style={{ color: theme.color.muted, textAlign: "center", paddingTop: theme.space(6) }}>No emoji found</Text>
              ) : null
            }
          />
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function EmojiCell({ entry, onPress }: { entry: EmojiEntry; onPress: (entry: EmojiEntry) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityLabel={`React with :${entry.name}:`}
      style={({ pressed }) => ({
        width: CELL,
        height: CELL,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radius.sm,
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      {entry.emoji ? (
        <Text style={{ fontSize: 22 }}>{entry.emoji}</Text>
      ) : entry.url ? (
        <Image source={{ uri: entry.url }} style={{ width: 22, height: 22 }} resizeMode="contain" />
      ) : null}
    </Pressable>
  );
}
