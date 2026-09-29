import { router } from "expo-router";
import { Pressable } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { QrCodeIcon } from "phosphor-react-native/src/icons/QrCode";

/** Opens the scanner for linking a new device (GRYT-1484). */
export function LinkDeviceRow() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push("/link-device")}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <QrCodeIcon size={22} color={theme.color.text} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500", flex: 1 }}>Link a new device</Text>
      <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
    </Pressable>
  );
}
