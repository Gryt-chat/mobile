import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Surface, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { ApproveButtons, askTitle, useNow, waitsText } from "./ApproveRequestCards";
import { useApproveRequests } from "./approveRequests";
import { useTabBarSpace } from "../shell/TabBar";

const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Every device waiting for you to approve it, newest first, each with when it asked and how long it still waits. */
export function ApproveDevicesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const requests = [...useApproveRequests()].sort((a, b) => b.askedAt - a.askedAt);
  const now = useNow(requests.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(2),
          paddingHorizontal: theme.space(2),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Waiting for approval</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), paddingBottom: theme.space(4) + tabBarSpace, gap: theme.space(3) }}>
        {requests.length === 0 ? (
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>Nothing is waiting for you now.</Text>
        ) : (
          <>
            <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
              Only approve a device that's in front of you. You'll type the code it shows. Say Not me to any you don't know.
            </Text>
            {requests.map((request) => (
              <Surface key={`${request.host} ${request.askId}`} level="surface" bordered radius="lg" style={{ padding: theme.space(4), gap: theme.space(3) }}>
                <View style={{ gap: theme.space(1) }}>
                  <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>{askTitle(request.deviceType)}</Text>
                  <Text style={{ color: theme.color.muted, fontSize: 14 }}>
                    Asked at {clock(request.askedAt)} · {waitsText(request.expiresAt, now)}
                  </Text>
                </View>
                <ApproveButtons request={request} />
              </Surface>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
