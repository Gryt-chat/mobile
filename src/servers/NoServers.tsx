import { Pressable, Text, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { PlanetIcon } from "phosphor-react-native/src/icons/Planet";

/**
 * What the app is before you have joined anything.
 *
 * There is no navbar decision to make here and no server colour to paint with,
 * so this is the whole screen rather than a state inside the Server tab: with
 * no servers, "Server" and "Search" have nothing to be about.
 */
export function NoServers({ onAdd }: { onAdd: () => void }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.space(8),
        gap: theme.space(4),
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: theme.radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        <PlanetIcon size={40} color={theme.color.muted} weight="fill" />
      </View>

      <View style={{ gap: theme.space(2) }}>
        <Text
          style={{
            color: theme.color.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          No servers yet
        </Text>
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 16,
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          Gryt servers are run by the people who use them. Join one with an invite, or
          with its address if you already know it.
        </Text>
      </View>

      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        style={({ pressed }) => ({
          paddingHorizontal: theme.space(8),
          paddingVertical: theme.space(4),
          borderRadius: theme.radius.full,
          backgroundColor: pressed ? theme.color.accentLight : theme.color.accent,
        })}
      >
        <Text style={{ color: theme.color.onAccent, fontSize: 17, fontWeight: "700" }}>
          Add a server
        </Text>
      </Pressable>
    </View>
  );
}
