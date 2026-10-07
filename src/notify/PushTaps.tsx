import * as Notifications from "expo-notifications";
import { useEffect } from "react";

import { useShell } from "../shell/ShellContext";
import { returnToTabs } from "../shell/returnToTabs";
import { hostForTag } from "./push";
import { tagFromResponse } from "./pushRules";

/* With the app open the server doesn't push, so one that slips through goes quietly to the list. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Opens the server a tapped notification came from. Draws nothing. */
export function PushTaps() {
  const { setServer } = useShell();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const tag = tagFromResponse(response);
    if (!tag) return;
    let cancelled = false;
    void hostForTag(tag).then((host) => {
      if (cancelled || !host) return;
      setServer(host);
      returnToTabs();
      void Notifications.clearLastNotificationResponseAsync();
    });
    return () => {
      cancelled = true;
    };
  }, [response, setServer]);

  return null;
}
