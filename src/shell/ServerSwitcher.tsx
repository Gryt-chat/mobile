import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Divider, Drawer, useTheme } from "@gryt/ui-native";
import { useServerMenu } from "../servers/useServerMenu";
import { useConnections } from "../connection/ConnectionsProvider";
import { DotsThreeVerticalIcon } from "phosphor-react-native/src/icons/DotsThreeVertical";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useShell } from "./ShellContext";
import { useServers, type JoinedServer } from "../servers/store";
import { ServerIcon } from "../servers/ServerIcon";

/**
 * The server switcher, as a drawer from the left.
 *
 * The desktop client puts this in a permanent vertical rail; a phone has no
 * room for one, so it is a drawer you pull the server name to open. Every
 * server you are in, then the one action that is about this list: adding
 * another.
 *
 * **It holds nothing that is not about servers.** It had a Preferences row and
 * a Discovery row; the first opened a screen the You page already reaches
 * under a different name, and the second opened the same sheet as the row
 * above it. Both are gone. A drawer titled "Your servers" that also holds the
 * app's settings is answering a question nobody asked it.
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
    lan,
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
            {/* Two rows, two destinations — which is the distinction that was
             * missing when Discovery opened this same sheet. Adding a server is
             * "I have an address"; discovery is "show me what is here". The
             * second is a page now, not a section inside the first: a list that
             * grows with the network pushed the sheet's own Add button off the
             * bottom, and with the keyboard up it was unreachable.
             *
             * "Preferences" was a third row and it opened `/preferences`, which
             * the You page already reaches under the name Settings. Same
             * destination, second name, plus a scope error — this drawer is
             * *your servers*, and how the app behaves is not one of them.
             * Settings lives on You, which is a tab and therefore one tap from
             * anywhere. */}
            <ActionRow
              icon={<PlusIcon size={22} color={theme.color.text} />}
              label="Add a server"
              onPress={() => {
                setSwitcherOpen(false);
                setAddServerOpen(true);
              }}
            />
            {lan.available ? (
              <ActionRow
                icon={<BroadcastIcon size={22} color={theme.color.text} />}
                label="Discovery"
                detail={
                  lan.blocked
                    ? "Network access is off"
                    : lan.servers.length > 0
                      ? `${lan.servers.length} on your network`
                      : lan.searching
                        ? "Looking on your network…"
                        : "Nothing found on your network"
                }
                onPress={() => {
                  setSwitcherOpen(false);
                  router.push("/discovery");
                }}
              />
            ) : null}
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
  const { unread: unreadByHost } = useConnections();
  const unread = unreadByHost[server.host] ?? 0;
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

      <UnreadPill count={unread} />

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

/**
 * How many messages arrived on a server while you were somewhere else.
 *
 * A component with this name existed and was deleted in GRYT-488, unused,
 * because nothing could ever have given it a number: the app held one socket,
 * to the server you were looking at, so a server you were not looking at said
 * nothing. GRYT-496 is what makes the count possible, and this is what it was
 * for.
 *
 * Capped rather than truncated to a dot. "9+" says there is more than a
 * glance's worth without pretending to a precision nobody reads past.
 */
function UnreadPill({ count }: { count: number }) {
  const theme = useTheme();

  if (count <= 0) return null;

  return (
    <View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.color.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityLabel={`${count} unread`}
    >
      <Text style={{ color: theme.color.onAccent, fontSize: 12, fontWeight: "700" }}>
        {count > 9 ? "9+" : count}
      </Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  /** A second line, for a row that has something to report. */
  detail?: string;
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
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>{label}</Text>
        {detail ? (
          <Text style={{ color: theme.color.muted, fontSize: 13 }} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
