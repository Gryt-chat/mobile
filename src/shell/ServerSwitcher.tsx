import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Divider, Drawer, useTheme } from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { useServerMenu } from "../servers/useServerMenu";
import { DotsThreeVerticalIcon } from "phosphor-react-native/src/icons/DotsThreeVertical";
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
              /* The drawer closes first here, and unlike the leave
                 confirmation that is correct: this is a navigation rather than
                 a modal, so there is nothing being presented that iOS could
                 drop while the drawer is on its way out. Leaving it open would
                 put the drawer over the screen you just asked for. */
              onPress={() => {
                setSwitcherOpen(false);
                router.push("/preferences");
              }}
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

      {/* The dots are back, and this time they open the menu.
       *
       * GRYT-480 took them off because they looked like a button and were not
       * one — the menu was only on the long press. That left the long press
       * with no affordance at all, which is the same problem from the other
       * side: the only way to leave a server was a gesture nothing announced.
       *
       * A nested Pressable, so the row keeps its own press. React Native gives
       * the touch to the innermost view that wants it, so tapping the dots does
       * not also switch server — and the long press stays on the row, because
       * somebody who knows the gesture should not have to find the target. */}
      <Pressable
        onPress={menu}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${server.name}`}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: theme.radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
        })}
      >
        <DotsThreeVerticalIcon size={20} color={theme.color.muted} weight="bold" />
      </Pressable>
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
