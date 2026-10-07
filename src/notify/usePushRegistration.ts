import { useEffect, useMemo } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import type { Socket } from "socket.io-client";

import type { NotificationLevel } from "../connection/types";
import { useNotificationPrefs } from "./notificationPrefs";
import { capabilityFor, deviceToken, forgetCapability, getInstallId, hasCapability, useOsAllowsPush } from "./push";
import { setPushChoice, usePushChoice } from "./pushChoice";
import { isBackground, mutedConversations, pushLevel, pushStep } from "./pushRules";

/** Servers being asked right now, so a reconnect mid-question doesn't ask twice. */
const asking = new Set<string>();

function ask(host: string, serverName: string): void {
  if (asking.has(host)) return;
  asking.add(host);
  const answer = (choice: "yes" | "no") => () => {
    asking.delete(host);
    setPushChoice(host, choice);
  };
  Alert.alert(
    `Notifications from ${serverName}?`,
    "Get a notification when someone mentions you or sends you a direct message here, even with the app closed. You can change this in notification settings.",
    [
      { text: "Not now", style: "cancel", onPress: answer("no") },
      { text: "Turn on", onPress: answer("yes") },
    ],
    { cancelable: false },
  );
}

/**
 * Hands this server the phone's capability, or takes it back, and says when the app
 * goes to the background (GRYT-1656, GRYT-1689). Mutes travel with it.
 */
export function usePushRegistration(p: {
  host: string;
  serverName: string;
  socket: Socket | null;
  online: boolean;
  getAccessToken: () => Promise<string | null>;
  channels: readonly { id: string; defaultNotificationLevel?: NotificationLevel | null }[];
  onScreen: boolean;
}): void {
  const { host, serverName, socket, online, getAccessToken, channels, onScreen } = p;
  const prefs = useNotificationPrefs();
  const choice = usePushChoice(host);
  const osAllows = useOsAllowsPush();
  const level = pushLevel(prefs, host);
  const muted = useMemo(() => mutedConversations(prefs, host, channels), [prefs, host, channels]);
  const mutedKey = muted.join("\n");
  const step = pushStep({ level, choice, osAllows, onScreen });

  useEffect(() => {
    if (!socket || !online) return;
    if (step === "ask") return ask(host, serverName);
    if (step === "wait") return;
    let cancelled = false;
    void (async () => {
      const accessToken = await getAccessToken();
      if (cancelled || !accessToken) return;
      const installId = await getInstallId();
      if (step === "unregister") {
        if (!(await hasCapability(host))) return;
        await forgetCapability(host);
        socket.emit("push:unregister", { accessToken, installId }, () => {});
        return;
      }
      const token = await deviceToken();
      if (cancelled || !token) return;
      const capability = await capabilityFor(host, token);
      if (cancelled || !capability) return;
      // An older server has no handler and never answers, which is fine.
      socket.emit("push:register", { accessToken, installId, capability, muted: mutedKey ? mutedKey.split("\n") : [] }, () => {});
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [host, serverName, socket, online, getAccessToken, step, mutedKey]);

  useEffect(() => {
    if (!socket || !online) return;
    const tell = (state: AppStateStatus) => socket.emit("push:presence", { background: isBackground(state) });
    tell(AppState.currentState);
    const subscription = AppState.addEventListener("change", tell);
    return () => subscription.remove();
  }, [socket, online]);
}
