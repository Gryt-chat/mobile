import { Pressable, Text, View } from "react-native";
import { Divider, Drawer, useTheme } from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { useServerMenu } from "../servers/useServerMenu";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useShell } from "./ShellContext";
import { useServers, type JoinedServer } from "../servers/store";
import { ServerIcon } from "../servers/ServerIcon";

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
  const {
    servers,
    server,
    setServer,
    switcherOpen,
    setSwitcherOpen,
    setAddServerOpen,
  } = useShell();
  const { leave } = useServers();

  return (
    <Drawer.Root open={switcherOpen} onOpenChange={setSwitcherOpen}>
      <Drawer.Portal>
        <Drawer.Popup side="left" size={0.74} style={{ padding: 0 }}>
          {/* `Drawer.ScrollView`, not React Native's — the drawer's swipe and a
              scroll view's native recogniser both want the touch, and the two
              are introduced by reference. A plain one does not scroll in here
              at all, which nobody noticed because the list has always been
              shorter than the screen. */}
          <Drawer.ScrollView
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
                key={s.host}
                server={s}
                active={s.host === server?.host}
                onPress={() => {
                  setServer(s.host);
                  setSwitcherOpen(false);
                }}
                /* The drawer closes after, not before. Closing it first was
                 * what broke this: the confirmation was a React Native modal
                 * and iOS drops one presented while another is dismissing, so
                 * the drawer shut and nothing was ever asked. */
                onLeave={() => {
                  void leave(s.host);
                  setSwitcherOpen(false);
                }}
              />
            ))}
          </Drawer.ScrollView>

          {/* Pinned rather than after the list, so adding a server does not
              drift down the screen as you join more of them. */}
          <View style={{ paddingHorizontal: theme.space(3), paddingBottom: theme.space(2) }}>
            <Divider style={{ marginBottom: theme.space(2) }} />
            <ActionRow
              icon={<PlusIcon size={22} color={theme.color.text} />}
              label="Add a server"
              onPress={() => {
                setSwitcherOpen(false);
                setAddServerOpen(true);
              }}
            />
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
  onLeave,
}: {
  server: JoinedServer;
  active: boolean;
  onPress: () => void;
  onLeave: () => void;
}) {
  const theme = useTheme();
  const menu = useServerMenu({
    server,
    /* Offered here and not on the header, where you are already on it. */
    onSwitch: active ? undefined : onPress,
    onLeave,
  });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={menu}
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
      <ServerIcon host={server.host} name={server.name} size={48} active={active} />

      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "700" }}>
          {server.name}
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 14 }} numberOfLines={1}>
          {server.host}
        </Text>
      </View>

    </Pressable>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
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
