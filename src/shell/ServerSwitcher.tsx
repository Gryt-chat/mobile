import { Pressable, ScrollView, Text, View } from "react-native";
import { Divider, Drawer, useTheme } from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { DotsThreeIcon } from "phosphor-react-native/src/icons/DotsThree";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useShell } from "./ShellContext";
import type { Server } from "./data";

/**
 * The server switcher, as a drawer from the left.
 *
 * The desktop client puts this in a permanent vertical rail; a phone has no
 * room for one, so it is a drawer you pull the server name to open. Same
 * contents in the same order — every server, then adding one, then discovery.
 *
 * Narrower than the screen on purpose, and not by much less than the reference.
 * A drawer that covers everything reads as a screen you navigated to, and the
 * strip of the server still showing on the right is what says you can put this
 * back. Actions are pinned to the bottom, which is where the reference has them
 * and where a thumb is.
 *
 * Controlled from `useShell` rather than by `Drawer.Trigger`, because the thing
 * that opens it is the header on the Server screen and this is mounted at the
 * root so it covers the tab bar.
 */
export function ServerSwitcher() {
  const theme = useTheme();
  const { servers, server, setServer, switcherOpen, setSwitcherOpen } = useShell();

  return (
    <Drawer.Root open={switcherOpen} onOpenChange={setSwitcherOpen}>
      <Drawer.Portal>
        <Drawer.Popup side="left" size={0.74} style={{ padding: 0 }}>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: theme.space(3),
              paddingTop: theme.space(4),
              gap: theme.space(1),
            }}
          >
            <Text
              style={{
                color: theme.color.text,
                fontSize: 22,
                fontWeight: "800",
                paddingHorizontal: theme.space(2),
                paddingBottom: theme.space(3),
              }}
            >
              Your servers
            </Text>

            {servers.map((s) => (
              <ServerRow
                key={s.id}
                server={s}
                active={s.id === server.id}
                onPress={() => {
                  setServer(s.id);
                  setSwitcherOpen(false);
                }}
              />
            ))}
          </ScrollView>

          {/* Pinned rather than after the list, so adding a server does not
              drift down the screen as you join more of them. */}
          <View style={{ paddingHorizontal: theme.space(3), paddingBottom: theme.space(2) }}>
            <Divider style={{ marginBottom: theme.space(2) }} />
            <ActionRow icon={<PlusIcon size={22} color={theme.color.text} />} label="Add a server" />
            <ActionRow
              icon={<BroadcastIcon size={22} color={theme.color.text} />}
              label="Discovery"
            />
            <ActionRow
              icon={<GearSixIcon size={22} color={theme.color.text} />}
              label="Preferences"
            />
          </View>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ServerRow({
  server,
  active,
  onPress,
}: {
  server: Server;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        padding: theme.space(2),
        borderRadius: theme.radius.lg,
        backgroundColor: active
          ? theme.color.surfaceHover
          : pressed
            ? theme.color.surfaceRaised
            : "transparent",
      })}
    >
      {/* A rounded square rather than a circle, and ringed while active. A
          circle is a person here — the voice tiles and the member list both use
          one — so a server being a square is what keeps the two apart. */}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: theme.radius.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: server.color,
          borderWidth: active ? 2 : 0,
          borderColor: theme.color.text,
        }}
      >
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>
          {server.initials}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "700" }}>
          {server.name}
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 14 }} numberOfLines={1}>
          {server.host}
        </Text>
      </View>

      {server.unread ? <UnreadPill count={server.unread} /> : null}
      <DotsThreeIcon size={22} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}

function ActionRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        paddingHorizontal: theme.space(2),
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      {icon}
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

export function UnreadPill({ count }: { count: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        minWidth: 22,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: theme.radius.full,
        backgroundColor: theme.color.accent,
        alignItems: "center",
      }}
    >
      <Text style={{ color: theme.color.onAccent, fontSize: 12, fontWeight: "700" }}>
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
}
