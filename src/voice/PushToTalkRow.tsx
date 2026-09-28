import { View } from "react-native";
import { Switch, Text, useTheme } from "@gryt/ui-native";

import { setPushToTalkEnabled, usePushToTalk } from "./pushToTalk";

/** The desktop's input mode, as a switch. A phone has one way to hold a key, so there's no binding to pick. */
export function PushToTalkRow() {
  const theme = useTheme();
  const { enabled } = usePushToTalk();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3), paddingVertical: theme.space(3) }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>Push to talk</Text>
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
          In a call, the mute button becomes one you hold down to talk. Let go and nobody hears you.
        </Text>
      </View>
      <Switch checked={enabled} onCheckedChange={setPushToTalkEnabled} />
    </View>
  );
}
