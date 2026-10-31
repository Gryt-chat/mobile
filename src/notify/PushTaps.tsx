import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";

import { useShell } from "../shell/ShellContext";
import { returnToTabs } from "../shell/returnToTabs";
import { openPreview } from "./previewOpen";
import { hostForTag, keyForTag } from "./push";
import { previewFromResponse, tagFromResponse, tapHref } from "./pushRules";

/* With the app open the server doesn't push, so one that slips through goes quietly to the list. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Opens the server and conversation a tapped notification came from. Draws nothing. */
export function PushTaps() {
  const { setServer } = useShell();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const tag = tagFromResponse(response);
    if (!tag) return;
    let cancelled = false;
    void Promise.all([hostForTag(tag), keyForTag(tag)]).then(([host, key]) => {
      if (cancelled || !host) return;
      const blob = previewFromResponse(response);
      const href = tapHref(blob && key ? openPreview(blob, tag, key) : null);
      setServer(host);
      returnToTabs();
      // Pushed from the tabs, because dismissTo can't reach a DM's route on the Messages tab.
      if (href) router.push(href);
      void Notifications.clearLastNotificationResponseAsync();
    });
    return () => {
      cancelled = true;
    };
  }, [response, setServer]);

  return null;
}
