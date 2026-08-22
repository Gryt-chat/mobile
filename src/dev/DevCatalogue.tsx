/* The dev surface: an index of every component, and a page per component.
 *
 * Deliberately not built on a navigation library. The app will need one, and
 * which one is an architectural decision that should be made for the app's
 * sake rather than settled in passing by a test harness. Two screens and a
 * back button do not justify choosing expo-router today.
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../ui/Text";
import { Divider, Surface, useTheme } from "@gryt/ui-native";
import { entries } from "./registry";
import { FrameProbe } from "../FrameProbe";
import { Note } from "./Row";

const groups = [...new Set(entries.map((e) => e.group))];

export function DevCatalogue() {
  const theme = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = entries.find((e) => e.id === openId) ?? null;

  if (open) {
    const { Demo } = open;

    return (
      <View style={[styles.fill, { backgroundColor: theme.color.bg }]}>
        <View style={[styles.bar, { borderBottomColor: theme.color.border }]}>
          <Pressable onPress={() => setOpenId(null)} hitSlop={12} style={styles.back}>
            <Text style={{ color: theme.color.accent, fontSize: 16 }}>‹ All components</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={[styles.title, { color: theme.color.text }]}>{open.name}</Text>
          {open.notes ? (
            <Surface level="raised" bordered radius="md" padding={12}>
              <Note>{open.notes}</Note>
            </Surface>
          ) : null}
          <Demo />
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.color.bg }}
      contentContainerStyle={styles.index}
    >
      <Text style={[styles.title, { color: theme.color.text }]}>Gryt UI Native</Text>
      <Text style={[styles.sub, { color: theme.color.muted }]}>
        {entries.length} pages. Same tokens as the desktop client, drawn by React
        Native. Tap anything that feels wrong and tell me what it did.
      </Text>

      <Surface level="surface" bordered radius="lg" padding={16} style={{ gap: 12 }}>
        <FrameProbe />
      </Surface>

      {groups.map((group) => (
        <View key={group} style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.color.muted }]}>
            {group.toUpperCase()}
          </Text>
          <Surface level="surface" bordered radius="lg">
            {entries
              .filter((e) => e.group === group)
              .map((entry, i, all) => (
                <View key={entry.id}>
                  <Pressable
                    onPress={() => setOpenId(entry.id)}
                    style={({ pressed }) => [
                      styles.rowItem,
                      pressed && { backgroundColor: theme.color.surfaceHover }
                    ]}
                  >
                    <Text style={{ color: theme.color.text, fontSize: 16 }}>
                      {entry.name}
                    </Text>
                    <Text style={{ color: theme.color.muted, fontSize: 18 }}>›</Text>
                  </Pressable>
                  {i < all.length - 1 ? <Divider /> : null}
                </View>
              ))}
          </Surface>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { paddingTop: 60, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { alignSelf: "flex-start" },
  page: { padding: 16, paddingBottom: 64, gap: 20 },
  index: { padding: 16, paddingTop: 72, paddingBottom: 64, gap: 20 },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  sub: { fontSize: 14, lineHeight: 20 },
  group: { gap: 8 },
  groupTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 1 },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16
  }
});
