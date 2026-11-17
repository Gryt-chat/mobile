import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";

import { showNotMe } from "./approveAsks";
import { type ApproveRequest, useApproveRequests } from "./approveRequests";
import { youPage } from "../shell/twoPane";

export const minutesLeft = (expiresAt: number, now: number) => Math.max(1, Math.ceil((expiresAt - now) / 60_000));

export function waitsText(expiresAt: number, now: number): string {
  const left = minutesLeft(expiresAt, now);
  return `Waits ${left} more ${left === 1 ? "minute" : "minutes"}`;
}

export function askTitle(deviceType: string): string {
  return `${/^[aeiou]/i.test(deviceType) ? "An" : "A"} ${deviceType} wants to open your messages`;
}

/** Re-renders every 30 seconds while anything waits, so the minutes count down. */
export function useNow(active: boolean): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(tick);
  }, [active]);
  return Date.now();
}

export function ApproveButtons({ request }: { request: ApproveRequest }) {
  const theme = useTheme();
  return (
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
  );
}

/** One ask: the whole card. More than one: a card that opens the list of them. Nothing when there's none. */
export function ApproveRequestCards() {
  const theme = useTheme();
  const requests = useApproveRequests();
  const now = useNow(requests.length > 0);

  if (requests.length === 0) return null;

  const frame = {
    gap: theme.space(3),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.accent,
    backgroundColor: theme.alpha.accent[2],
  };

  if (requests.length > 1) {
    return (
      <Pressable
        onPress={() => router.push(youPage("/approve-devices"))}
        accessibilityRole="button"
        accessibilityHint="Opens the devices waiting for you"
        style={({ pressed }) => [frame, { flexDirection: "row", alignItems: "center", opacity: pressed ? 0.85 : 1 }]}
      >
        <ShieldCheckIcon size={24} color={theme.color.accent} weight="fill" />
        <View style={{ flex: 1, gap: theme.space(1) }}>
          <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>
            {requests.length} devices want to open your messages
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
            Only approve the ones in front of you.
          </Text>
        </View>
        <CaretRightIcon size={20} color={theme.color.muted} weight="bold" />
      </Pressable>
    );
  }

  const request = requests[0];
  return (
    <View style={frame}>
      <View style={{ flexDirection: "row", gap: theme.space(3), alignItems: "flex-start" }}>
        <ShieldCheckIcon size={24} color={theme.color.accent} weight="fill" />
        <View style={{ flex: 1, gap: theme.space(1) }}>
          <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>{askTitle(request.deviceType)}</Text>
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
            Only approve it if it's in front of you. {waitsText(request.expiresAt, now)}.
          </Text>
        </View>
      </View>
      <ApproveButtons request={request} />
    </View>
  );
}
