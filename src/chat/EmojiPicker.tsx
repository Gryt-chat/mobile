import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, TextInput, useWindowDimensions, View } from "react-native";
import { Drawer, Text, useTheme } from "@gryt/ui-native";
import { AirplaneTiltIcon } from "phosphor-react-native/src/icons/AirplaneTilt";
import { ClockIcon } from "phosphor-react-native/src/icons/Clock";
import { FlagIcon } from "phosphor-react-native/src/icons/Flag";
import { ForkKnifeIcon } from "phosphor-react-native/src/icons/ForkKnife";
import { HandWavingIcon } from "phosphor-react-native/src/icons/HandWaving";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";
import { LightbulbIcon } from "phosphor-react-native/src/icons/Lightbulb";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { PawPrintIcon } from "phosphor-react-native/src/icons/PawPrint";
import { SmileyWinkIcon } from "phosphor-react-native/src/icons/SmileyWink";
import { SoccerBallIcon } from "phosphor-react-native/src/icons/SoccerBall";
import { SparkleIcon } from "phosphor-react-native/src/icons/Sparkle";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { useCustomEmojis } from "./CustomEmojiProvider";
import {
  getStandardEmojisByCategory,
  reactionSrcFor,
  searchEmojis,
  type EmojiEntry,
} from "./emojiCategories";
import { getRecentReactions, recordReaction } from "./recentReactions";

const COLS = 8;
const HEADER = 32;
const GUTTER = 16;

/* The bottom tab row, in the order the sections are drawn (GRYT-1722 drafts). */
const TAB_ICONS: Record<string, typeof ClockIcon> = {
  Custom: SparkleIcon,
  "Recently Used": ClockIcon,
  "Smileys & Emotion": SmileyWinkIcon,
  "People & Body": HandWavingIcon,
  "Animals & Nature": PawPrintIcon,
  "Food & Drink": ForkKnifeIcon,
  Activities: SoccerBallIcon,
  "Travel & Places": AirplaneTiltIcon,
  Objects: LightbulbIcon,
  Symbols: HeartIcon,
  Flags: FlagIcon,
};
const LABELS: Record<string, string> = {
  Custom: "This server",
  "Recently Used": "Recently used",
  "Smileys & Emotion": "Smileys",
  "People & Body": "People",
};

type Row = { kind: "header"; key: string; label: string } | { kind: "cells"; key: string; cells: EmojiEntry[] };

function toRows(sections: { key: string; entries: EmojiEntry[] }[]): Row[] {
  const rows: Row[] = [];
  for (const section of sections) {
    if (section.entries.length === 0) continue;
    rows.push({ kind: "header", key: section.key, label: LABELS[section.key] ?? section.key });
    for (let i = 0; i < section.entries.length; i += COLS) {
      rows.push({ kind: "cells", key: section.key, cells: section.entries.slice(i, i + COLS) });
    }
  }
  return rows;
}

/**
 * Every emoji this server offers — standard and custom — with the desktop picker's own
 * categories, search and recent list. For reactions, and for a card's emoji pattern.
 */
export function EmojiPicker({
  open,
  onOpenChange,
  onSelect,
  onPickEntry,
  title = "React with",
  serverHost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A reaction: the picked emoji as a reaction source, which also goes on the recent list. */
  onSelect?: (src: string) => void;
  /** Anything else: the entry itself, and the recent reactions are left alone. */
  onPickEntry?: (entry: EmojiEntry) => void;
  /** What the sheet is for, read out by a screen reader. */
  title?: string;
  serverHost?: string;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - GUTTER * 2) / COLS);
  const customMap = useCustomEmojis();
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // A jump remounts the list at the section, since the drawer's list takes no ref.
  const [jump, setJump] = useState<{ index: number; n: number }>({ index: 0, n: 0 });

  /* Reloaded on every open rather than kept live: a reaction picked a minute ago
   * belongs at the front the next time this opens, not mid-session. */
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setJump((j) => ({ index: 0, n: j.n + 1 }));
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
    if (results) return toRows([{ key: `Results for “${search.trim()}”`, entries: results }]);
    return toRows([
      { key: "Custom", entries: customEntries },
      { key: "Recently Used", entries: recentEntries },
      ...[...standardByCategory.entries()].map(([key, entries]) => ({ key, entries })),
    ]);
  }, [results, search, recentEntries, customEntries, standardByCategory]);

  const tabs = useMemo(
    () => (results ? [] : rows.flatMap((row, index) => (row.kind === "header" ? [{ key: row.key, index }] : []))),
    [rows, results],
  );
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const row of rows) {
      out.push(y);
      y += row.kind === "header" ? HEADER : cell;
    }
    return out;
  }, [rows, cell]);

  const pick = (entry: EmojiEntry) => {
    if (onPickEntry) onPickEntry(entry);
    else if (onSelect) {
      const src = reactionSrcFor(entry);
      void recordReaction(src, serverHost);
      onSelect(src);
    }
    onOpenChange(false);
  };
  const current = active ?? tabs[0]?.key ?? null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Popup side="bottom" size={0.72}>
          <View accessibilityLabel={title} style={{ flex: 1 }}>
            <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700", paddingHorizontal: GUTTER, paddingTop: theme.space(4), paddingBottom: theme.space(3) }}>
              {title}
            </Text>
            <View style={{ paddingHorizontal: GUTTER, paddingBottom: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  height: 42,
                  paddingHorizontal: 14,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: search ? theme.color.accent : theme.color.border,
                  backgroundColor: theme.color.bg,
                }}
              >
                <MagnifyingGlassIcon size={16} color={theme.color.muted} weight="bold" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search emoji"
                  placeholderTextColor={theme.color.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    const first = rows.find((row) => row.kind === "cells");
                    if (first && first.kind === "cells" && first.cells[0]) pick(first.cells[0]);
                  }}
                  style={{ flex: 1, color: theme.color.text, fontSize: 16, padding: 0 }}
                />
                {search ? (
                  <Pressable onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                    <XIcon size={14} color={theme.color.muted} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Drawer.FlatList
              key={`list-${jump.n}`}
              data={rows}
              keyExtractor={(_: Row, i: number) => String(i)}
              initialScrollIndex={jump.index < rows.length ? jump.index : 0}
              getItemLayout={(_: ArrayLike<Row> | null | undefined, index: number) => ({
                length: rows[index]?.kind === "header" ? HEADER : cell,
                offset: offsets[index] ?? 0,
                index,
              })}
              onViewableItemsChanged={({ viewableItems }: { viewableItems: { item: Row }[] }) => {
                const top = viewableItems[0]?.item;
                if (top) setActive(top.key);
              }}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: theme.space(3) }}
              renderItem={({ item }: { item: Row }) =>
                item.kind === "header" ? (
                  <Text
                    style={{
                      height: HEADER,
                      paddingTop: 10,
                      fontSize: 12,
                      fontWeight: "700",
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: theme.color.muted,
                    }}
                  >
                    {item.label}
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row" }}>
                    {item.cells.map((entry, i) => (
                      <EmojiCell key={`${entry.isCustom ? "c" : "s"}:${entry.name}-${i}`} entry={entry} size={cell} onPress={pick} react={!onPickEntry} />
                    ))}
                  </View>
                )
              }
              ListEmptyComponent={
                results ? (
                  <Text style={{ color: theme.color.muted, textAlign: "center", paddingTop: theme.space(6) }}>No emoji called that.</Text>
                ) : undefined
              }
            />

            {tabs.length > 0 ? (
              <View
                accessibilityRole="tablist"
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: 10,
                  paddingTop: 6,
                  paddingBottom: theme.space(2),
                  borderTopWidth: 1,
                  borderTopColor: theme.color.border,
                }}
              >
                {tabs.map((tab) => {
                  const Glyph = TAB_ICONS[tab.key] ?? SmileyWinkIcon;
                  const on = tab.key === current;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => {
                        setActive(tab.key);
                        setJump((j) => ({ index: tab.index, n: j.n + 1 }));
                      }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={LABELS[tab.key] ?? tab.key}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: on ? theme.color.surfaceHover : "transparent",
                      }}
                    >
                      <Glyph size={20} weight="bold" color={on ? theme.color.accent : theme.color.muted} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function EmojiCell({ entry, size, onPress, react }: { entry: EmojiEntry; size: number; onPress: (entry: EmojiEntry) => void; react: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityLabel={react ? `React with :${entry.name}:` : `:${entry.name}:`}
      style={({ pressed }) => ({
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      {entry.emoji ? <Text style={{ fontSize: 28 }}>{entry.emoji}</Text> : null}
      {!entry.emoji && entry.url ? (
        <Image source={{ uri: entry.url }} style={{ width: 28, height: 28 }} resizeMode="contain" />
      ) : null}
    </Pressable>
  );
}
