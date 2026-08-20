import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";

import { useShell } from "./ShellContext";
import { ME } from "./data";
import { initialsFor } from "../servers/initials";

/**
 * The band at the top of the Server tab.
 *
 * Drawn rather than a `UINavigationBar` because a native bar would have to be
 * lied to about its title and its right item at once.
 *
 * It used to be painted in the server's own colour, which is the one piece of
 * chrome that says which server you are in without being read. A real server
 * has no colour to paint with — `/info` sends a name, a description and an
 * icon, and no palette — so it is the surface until the icon is wired and there
 * is something to take a colour from. GRYT-407.
 *
 * Two targets, at opposite ends, and both open something rather than
 * navigating: the name opens the server switcher, the avatar opens the "you"
 * sheet. The avatar is the same sheet the You tab opens — the reference puts it
 * here and the brief puts it in the navbar, and until one of those is settled
 * it is reachable from both.
 *
 * `paddingTop` from the safe area rather than a `SafeAreaView`, so the colour
 * runs under the status bar instead of leaving a black band above it.
 */
export function ServerHeader() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { server, setSwitcherOpen, setYouOpen } = useShell();

  return (
    <View
      style={{
        backgroundColor: theme.color.surface,
        paddingTop: insets.top + theme.space(1),
        paddingBottom: theme.space(3),
        paddingHorizontal: theme.space(3),
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        borderBottomWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      <Pressable
        onPress={() => setSwitcherOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${server?.name ?? "No server"}. Switch server`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          flex: 1,
          padding: theme.space(1),
          borderRadius: theme.radius.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: theme.radius.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.color.surfaceHover,
          }}
        >
          <Text style={{ color: theme.color.text, fontSize: 13, fontWeight: "700" }}>
            {initialsFor(server?.name ?? "?")}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 22, fontWeight: "800", flex: 1 }}
        >
          {server?.name ?? "No server"}
        </Text>
        <CaretDownIcon size={16} color={theme.color.text} weight="bold" />
      </Pressable>

      <Pressable
        onPress={() => setYouOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="You"
        style={({ pressed }) => ({
          padding: 4,
          borderRadius: theme.radius.full,
          backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
        })}
      >
        <Avatar name={ME.name} size="sm" />
      </Pressable>
    </View>
  );
}
