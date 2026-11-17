import { useEffect, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";

import { showNotMe } from "./approveAsks";
import { useApproveRequests } from "./approveRequests";
import { youPage } from "../shell/twoPane";

const minutesLeft = (expiresAt: number, now: number) => Math.max(1, Math.ceil((expiresAt - now) / 60_000));

/** One card per device waiting for you, while its ask is still good. Nothing when there's none. */
export function ApproveRequestCards() {
  const theme = useTheme();
  const requests = useApproveRequests();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (requests.length === 0) return;
    const tick = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(tick);
  }, [requests.length]);

  if (requests.length === 0) return null;
  const now = Date.now();

  return (
    <View style={{ gap: theme.space(2) }}>
      {requests.map((request) => {
        const article = /^[aeiou]/i.test(request.deviceType) ? "An" : "A";
        const left = minutesLeft(request.expiresAt, now);
        return (
          <View
            key={`${request.host} ${request.askId}`}
            style={{
              gap: theme.space(3),
              padding: theme.space(4),
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.color.accent,
              backgroundColor: theme.alpha.accent[2],
            }}
          >
            <View style={{ flexDirection: "row", gap: theme.space(3), alignItems: "flex-start" }}>
              <ShieldCheckIcon size={24} color={theme.color.accent} weight="fill" />
              <View style={{ flex: 1, gap: theme.space(1) }}>
                <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>
                  {article} {request.deviceType} wants to open your messages
                </Text>
                <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
                  Only approve it if it's in front of you. It waits {left} more {left === 1 ? "minute" : "minutes"}.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: theme.space(2) }}>
              <Button
                tone="ghost"
                onPress={() => {
                  request.deny();
                  showNotMe();
                }}
              >
                Not me
              </Button>
              <Button tone="primary" onPress={() => router.push(youPage("/link-device"))}>
                Approve
              </Button>
            </View>
          </View>
        );
      })}
    </View>
  );
}
