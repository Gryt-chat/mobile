import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { Socket } from "socket.io-client";

import { useNotificationPrefs } from "./notificationPrefs";
import { capabilityFor, deviceToken, forgetCapability, getInstallId, hasCapability } from "./push";
import { isBackground, pushLevel } from "./pushRules";

/**
 * Hands this server the phone's capability on every connect, or takes it back when
 * the server is muted, and says when the app goes to the background (GRYT-1656).
 */
export function usePushRegistration(
  host: string,
  socket: Socket | null,
  online: boolean,
  getAccessToken: () => Promise<string | null>,
): void {
  const level = pushLevel(useNotificationPrefs(), host);

  useEffect(() => {
    if (!socket || !online) return;
    let cancelled = false;
    void (async () => {
      const accessToken = await getAccessToken();
      if (cancelled || !accessToken) return;
      const installId = await getInstallId();
      if (level === "none") {
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
      socket.emit("push:register", { accessToken, installId, capability }, () => {});
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [host, socket, online, getAccessToken, level]);

  useEffect(() => {
    if (!socket || !online) return;
    const tell = (state: AppStateStatus) => socket.emit("push:presence", { background: isBackground(state) });
    tell(AppState.currentState);
    const subscription = AppState.addEventListener("change", tell);
    return () => subscription.remove();
  }, [socket, online]);
}
