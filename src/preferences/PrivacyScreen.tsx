import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Divider, Surface, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";

import { admitConversation, clearFiltered, dismissFiltered, filteredSummary, useFilteredContacts } from "../connection/contactFilterStore";
import { setGlobalContactRule, useContactPrefs } from "../connection/contactPrefs";
import { useActionSheet } from "../ui/actionSheet";
import { useServers } from "../servers/store";
import { ServerIcon } from "../servers/ServerIcon";
import { ChoiceRow } from "./ChoiceRow";
import { CALL_CHOICES, choiceLabel, MESSAGE_CHOICES } from "./contactChoices";
import { CALLS_TITLE, MESSAGES_TITLE, pickContactRule } from "./pickContactRule";

/**
 * Who can message and call you (GRYT-1470, GRYT-1534): the default, each server's
 * own answer, and what got held back. Also set from a server's long-press menu.
 */
export function PrivacyScreen() {
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
          Privacy
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5) }}>
        {/* Every server's answer, until it sets its own below. */}
        <Group title="Who can send me messages">
          <ContactPicker kind="messages" />
        </Group>
        <Group title="Who can call me">
          <ContactPicker kind="calls" />
        </Group>

        <Group title="Per server">
          <PerServerList />
        </Group>

        <FilteredGroup />
      </ScrollView>
    </View>
  );
}

/**
 * Who may message or ring you by default. A call choice looser than the message one
 * can't be picked, since a ring happens inside a conversation.
 */
function ContactPicker({ kind }: { kind: "messages" | "calls" }) {
  const { global } = useContactPrefs();
  const choices = kind === "messages" ? MESSAGE_CHOICES : CALL_CHOICES;
  const blocked = kind === "calls" && global.messages === "nobody";
  const current = blocked ? "nobody" : global[kind];

  return (
    <>
      {choices.map((option) => (
        <ChoiceRow
          key={option.value}
          label={option.label}
          hint={option.hint}
          chosen={option.value === current}
          disabled={blocked && option.value !== "nobody"}
          onPress={() => setGlobalContactRule(kind, option.value)}
        />
      ))}
    </>
  );
}

/** One row per joined server, showing its own answer or "Default", tapped to change
    it — the same setting a server's own long-press menu offers (GRYT-1470). */
function PerServerList() {
  const theme = useTheme();
  const { servers } = useServers();
  const contactPrefs = useContactPrefs();
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
        const own = contactPrefs.servers[server.host];
        const summary = own?.messages || own?.calls
          ? [
              own.messages ? `Messages: ${choiceLabel("messages", own.messages)}` : null,
              own.calls ? `Calls: ${choiceLabel("calls", own.calls)}` : null,
            ].filter(Boolean).join(" · ")
          : "Default";

        return (
          <Pressable
            key={server.host}
            onPress={() =>
              void present({
                title: server.name,
                options: [MESSAGES_TITLE, CALLS_TITLE, "Cancel"],
                cancelButtonIndex: 2,
              }).then((index) => {
                if (index === 0) pickContactRule(present, server, "messages", contactPrefs);
                else if (index === 1) pickContactRule(present, server, "calls", contactPrefs);
              })
            }
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
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
                {summary}
              </Text>
            </View>
            <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
          </Pressable>
        );
      })}
    </>
  );
}

/** What this phone has held back against the settings above (GRYT-1470). Quiet on
    purpose: no badge, and gone the moment nothing is in it. */
function FilteredGroup() {
  const theme = useTheme();
  const { servers } = useServers();
  const items = useFilteredContacts();

  if (items.length === 0) return null;

  const nameFor = (host: string) => servers.find((s) => s.host === host)?.name ?? host;

  const open = (item: (typeof items)[number]) => {
    admitConversation(item.host, item.conversationId);
    dismissFiltered(item.host, item.conversationId);
    router.push({ pathname: "/channel/[id]", params: { id: item.conversationId } });
  };

  const clearAll = () => {
    for (const host of new Set(items.map((item) => item.host))) clearFiltered(host);
  };

  return (
    <Group title="Filtered">
      <Text style={{ color: theme.color.muted, fontSize: 13, paddingBottom: theme.space(2) }}>
        Held back by the settings above. Nothing here made a sound or a badge.
      </Text>
      {items.map((item) => (
        <Pressable
          key={`${item.host}|${item.conversationId}|${item.kind}`}
          onPress={() => open(item)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            paddingVertical: theme.space(2),
            backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
          })}
        >
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15, fontWeight: "500" }}>
            {item.fromName || "Somebody"}
          </Text>
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
            {filteredSummary(item)} · {nameFor(item.host)}
          </Text>
        </Pressable>
      ))}
      <Pressable onPress={clearAll} accessibilityRole="button" style={{ paddingVertical: theme.space(2) }}>
        <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>Clear</Text>
      </Pressable>
    </Group>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
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
