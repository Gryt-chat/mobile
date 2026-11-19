import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Meter, Spinner, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { readableSize } from "../../chat/files";
import { CLOUD_CONSOLE_URL } from "../../server/planMode";
import { useShell } from "../../shell/ShellContext";
import { useTabBarSpace } from "../../shell/TabBar";
import { useCloudUsage } from "../cloudUsage";

const size = (n: number) => readableSize(n) ?? "0 B";

/** The same overview as the server's page in the Cloud console. The desktop's Gryt Cloud tab. */
export function ServerCloudScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const { server } = useShell();
  const usage = useCloudUsage(server?.host);

  const label = (text: string) => (
    <Text style={{ color: theme.color.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.9 }}>{text.toUpperCase()}</Text>
  );
  const pct = usage?.storage.used == null ? 0 : Math.min(100, (usage.storage.used / usage.storage.limit) * 100);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View style={{ paddingTop: insets.top + theme.space(2), paddingHorizontal: theme.space(4), paddingBottom: theme.space(3), flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}
          style={{ width: 40, height: 40, borderRadius: theme.radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceRaised }}>
          <CaretLeftIcon size={18} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Gryt Cloud</Text>
      </View>
      {!usage ? (
        <Spinner />
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(6), paddingBottom: tabBarSpace + 48 }}>
          <View style={{ gap: theme.space(2) }}>
            {label("Plan")}
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.space(2) }}>
              <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>{usage.plan.name}</Text>
              <Text style={{ color: theme.color.muted, fontSize: 14 }}>{usage.cycle === "yearly" ? "Billed yearly" : "Billed monthly"}</Text>
            </View>
            <Button size="small" style={{ alignSelf: "flex-start" }} onPress={() => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}${usage.manage}`)}>
              Manage in Gryt Cloud
            </Button>
          </View>
          <View style={{ gap: theme.space(2) }}>
            {label("Storage")}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.color.text, fontSize: 14 }}>{usage.storage.used == null ? "Not counted yet" : `${size(usage.storage.used)} used`}</Text>
              <Text style={{ color: theme.color.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{size(usage.storage.limit)}</Text>
            </View>
            <Meter value={pct} />
          </View>
          <View style={{ gap: theme.space(2) }}>
            {label("Transfer this month")}
            <Text style={{ color: theme.color.text, fontSize: 14 }}>{usage.transfer.sent == null ? "Not counted yet" : size(usage.transfer.sent)}</Text>
            <Text style={{ color: theme.color.muted, fontSize: 12 }}>What the server sent this month. It starts again at zero on the 1st.</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
