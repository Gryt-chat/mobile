import { useState } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { DiscordLogo, Text, useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";

const DISCORD_BLUE = "#5865F2";

/** The badge alone, over an avatar in a view the badge can sit in the corner of. */
export function DiscordBadgeDot({ size }: { size: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="Only on Discord"
      style={{
        position: "absolute",
        right: -2,
        bottom: -2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: DISCORD_BLUE,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: theme.color.surface,
      }}
    >
      <DiscordLogo size={Math.round(size * 0.55)} color="#fff" />
    </View>
  );
}

/** Someone who's only on Discord: a badge where a status dot would sit, and a plain card instead of a Gryt profile. */
export function DiscordOnlyAvatar({ name, source, size, status }: { name: string; source: string | null; size: number; status?: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const badge = Math.round(size * 0.4);
  const cardWidth = Math.min(useWindowDimensions().width - 32, 340);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${name}, only on Discord`} hitSlop={4} style={{ width: size, height: size, alignSelf: "flex-start" }}>
        <PersonAvatar name={name} source={source} size={size} />
        <DiscordBadgeDot size={badge} />
      </Pressable>
      {/* React Native's own Modal, like the member card: it opens over the members drawer, where a Dialog can't. */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close the card"
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
        >
          <Pressable onPress={() => {}} accessible={false} style={{ width: cardWidth, borderRadius: 16, overflow: "hidden", backgroundColor: theme.color.surface }}>
            <View style={{ height: 64, backgroundColor: DISCORD_BLUE }} />
            <View style={{ padding: theme.space(4), paddingTop: 0, gap: theme.space(2) }}>
              <View style={{ marginTop: -32 }}>
                <PersonAvatar name={name} source={source} size={64} />
              </View>
              <Text style={{ color: theme.color.text, fontSize: 19, fontWeight: "700" }}>{name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <DiscordLogo size={14} color={DISCORD_BLUE} />
                <Text style={{ color: theme.color.muted }}>Only on Discord{status ? ` · ${status}` : ""}</Text>
              </View>
              <Text style={{ color: theme.color.muted, lineHeight: 20 }}>
                {name} hasn{"\u2019"}t joined Gryt. What you write reaches them through the bridge. Once they join and link their Discord account, this becomes their Gryt profile.
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
