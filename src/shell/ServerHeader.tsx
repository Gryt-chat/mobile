import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";

import { useShell } from "./ShellContext";
import { ME } from "./data";

/**
 * The band at the top of the Server tab.
 *
 * Painted in the server's own colour rather than the surface, which is the one
 * piece of chrome that tells you which server you are in without reading
 * anything. It is also why this is drawn rather than a `UINavigationBar`: a
 * native bar would have to be lied to about its title, its tint and its right
 * item all at once.
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
        backgroundColor: server.color,
        paddingTop: insets.top + theme.space(1),
        paddingBottom: theme.space(3),
        paddingHorizontal: theme.space(3),
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
      }}
    >
      <Pressable
        onPress={() => setSwitcherOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${server.name}. Switch server`}
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
            backgroundColor: "rgba(255,255,255,0.14)",
          }}
        >
          <Text style={{ color: theme.color.text, fontSize: 13, fontWeight: "700" }}>
            {server.initials}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 22, fontWeight: "800", flex: 1 }}
        >
          {server.name}
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
          backgroundColor: pressed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)",
        })}
      >
        <Avatar name={ME.name} size="sm" />
      </Pressable>
    </View>
  );
}
