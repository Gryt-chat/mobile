import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { dismissDeviceNotice } from "./deviceNotices";
import { type DeviceNotice, newDeviceItemText } from "./newDeviceNotice";

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "New device linked" under Security, one per device, until it's dismissed (GRYT-1576). */
export function DeviceNoticeRows({ notices }: { notices: readonly DeviceNotice[] }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space(2), paddingVertical: theme.space(2) }}>
      {notices.map((notice) => (
        <View
          key={`${notice.scope} ${notice.deviceId}`}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: theme.space(2),
            padding: theme.space(3),
            borderRadius: theme.radius.lg,
            backgroundColor: theme.color.surfaceRaised,
          }}
        >
          <ShieldWarningIcon size={22} color={theme.color.warning} weight="fill" />
          <Pressable
            onPress={() => router.push("/devices")}
            accessibilityRole="button"
            accessibilityHint="Opens Your devices"
            style={{ flex: 1 }}
          >
            <Text style={{ color: theme.color.text, fontSize: 15, lineHeight: 21 }}>{newDeviceItemText(notice, when)}</Text>
          </Pressable>
          <Pressable
            onPress={() => dismissDeviceNotice(notice)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={8}
          >
            <XIcon size={18} color={theme.color.muted} weight="bold" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
