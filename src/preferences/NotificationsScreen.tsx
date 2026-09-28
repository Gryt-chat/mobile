import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Divider, Surface, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";

import { useActionSheet } from "../ui/actionSheet";
import { useServers } from "../servers/store";
import { ServerIcon } from "../servers/ServerIcon";
import { ChoiceRow } from "./ChoiceRow";
import { LEVEL_CHOICES, levelLabel } from "./notificationChoices";
import { pickNotificationLevel } from "./pickNotificationLevel";
import {
  getOwnLevel,
  globalOverrules,
  setGlobalLevel,
  useNotificationPrefs,
} from "../notify/notificationPrefs";

/**
 * How loud each server is (GRYT-1534): the global ceiling first, then every
 * server's own answer. A channel's own answer is set from its long-press menu.
 */
export function NotificationsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(2),
          paddingHorizontal: theme.space(2),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>
          Notifications
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5) }}>
        {/* First, because it is the one that decides what the rest can do. */}
        <Group
          title="Notification level"
          hint="Applies to every server. It can only quieten one, never make one louder — a server you have already muted stays muted."
        >
          <GlobalLevelPicker />
        </Group>

        <Group
          title="Per server"
          hint="How loud each server is on its own. Set from its long-press menu too — this is the same setting, in one place."
        >
          <PerServerList />
        </Group>
      </ScrollView>
    </View>
  );
}

function GlobalLevelPicker() {
  const { global } = useNotificationPrefs();

  return (
    <>
      {LEVEL_CHOICES.map((choice) => (
        <ChoiceRow
          key={choice.value}
          label={choice.label}
          chosen={choice.value === global}
          onPress={() => setGlobalLevel(choice.value)}
        />
      ))}
    </>
  );
}

/** One row per joined server, showing its own answer or "Default", tapped to change
    it — the same setting a server's long-press menu offers. */
function PerServerList() {
  const theme = useTheme();
  const { servers } = useServers();
  const { global } = useNotificationPrefs();
  const present = useActionSheet();

  if (servers.length === 0) {
    return (
      <Text style={{ color: theme.color.muted, fontSize: 13, paddingVertical: theme.space(3) }}>
        No servers yet. Join one and it will show up here.
      </Text>
    );
  }

  return (
    <>
      {servers.map((server) => {
        const own = getOwnLevel(server.host, { kind: "server" });
        // What the server comes out as before the ceiling, which is what the
        // ceiling is compared against. Unset means everything.
        const overruled = globalOverrules(global, own ?? "all");

        return (
          <Pressable
            key={server.host}
            onPress={() => pickNotificationLevel(present, server.host, { kind: "server" }, "Notifications", server.name, "all")}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(3),
              paddingVertical: theme.space(3),
              backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
            })}
          >
            <ServerIcon host={server.host} name={server.name} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>
                {server.name}
              </Text>
              {/* Only where it changes the answer — saying "limited by your
                  global setting" under a server already quieter than the
                  ceiling would be noise on every row. */}
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
                {overruled
                  ? global === "none"
                    ? "Muted by your notification level"
                    : "Limited to mentions by your notification level"
                  : own
                    ? levelLabel(own)
                    : "Default"}
              </Text>
            </View>
            <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
          </Pressable>
        );
      })}
    </>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const theme = useTheme();
  const rows = Array.isArray(children) ? children.filter(Boolean) : [children];

  return (
    <View style={{ gap: theme.space(1) }}>
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          paddingBottom: theme.space(1),
        }}
      >
        {title}
      </Text>
      {hint ? (
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18, paddingBottom: theme.space(1) }}>
          {hint}
        </Text>
      ) : null}
      <Surface bordered radius="lg" style={{ paddingHorizontal: theme.space(3) }}>
        {rows.map((row, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <View key={i}>
            {i > 0 ? <Divider /> : null}
            {row}
          </View>
        ))}
      </Surface>
    </View>
  );
}
