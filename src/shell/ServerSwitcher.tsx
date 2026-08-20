import { Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Divider, Drawer, useTheme } from "@gryt/ui-native";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";

import { useShell } from "./ShellContext";
import type { Server } from "./data";

/**
 * The server switcher, as a drawer from the left.
 *
 * The desktop client puts this in a permanent vertical rail; a phone has no
 * room for one, so it is a drawer you pull the server name to open. Same
 * contents in the same order — every server, then adding one, then discovery —
 * because they are the same list.
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
        <Drawer.Popup side="left" size={0.82} style={{ padding: 0 }}>
          <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(1) }}>
            <Text
              style={{
                color: theme.color.muted,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                paddingHorizontal: theme.space(2),
                paddingBottom: theme.space(2),
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

            <Divider style={{ marginVertical: theme.space(3) }} />

            <ActionRow
              icon={<PlusIcon size={20} color={theme.color.text} weight="bold" />}
              label="Add a server"
              hint="An invite link, or an address"
            />
            <ActionRow
              icon={<BroadcastIcon size={20} color={theme.color.text} weight="fill" />}
              label="Discovery"
              hint="Servers on your network"
            />
          </ScrollView>
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
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(2),
        borderRadius: theme.radius.md,
        backgroundColor: active
          ? theme.color.surfaceHover
          : pressed
            ? theme.color.surfaceRaised
            : "transparent",
      })}
    >
      <Avatar name={server.initials} size="md" />
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600", flex: 1 }}>
        {server.name}
      </Text>
      {server.unread ? <UnreadPill count={server.unread} /> : null}
    </Pressable>
  );
}

function ActionRow({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(2),
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radius.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }}>{hint}</Text>
      </View>
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
