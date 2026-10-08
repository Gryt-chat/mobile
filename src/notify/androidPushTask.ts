import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { ANDROID_CHANNEL, keyForTag } from "./push";
import { openPreview } from "./previewOpen";
import { type PushFields as Fields, pushFields } from "./pushRules";

/**
 * Android's half of sealed previews (GRYT-1698). The relay sends this phone data-only messages,
 * so nothing shows until this task builds the notification, from the preview or the fallback text.
 */
export const ANDROID_PUSH_TASK = "gryt-android-push";

async function show(fields: Fields): Promise<void> {
  const key = fields.c && fields.p ? await keyForTag(fields.c) : null;
  const preview = key && fields.p && fields.c ? openPreview(fields.p, fields.c, key) : null;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: preview?.t ?? fields.t ?? "Gryt",
      subtitle: preview?.s,
      body: preview?.b ?? fields.b,
      sound: "default",
      data: { c: fields.c },
    },
    trigger: { channelId: ANDROID_CHANNEL },
  });
}

// Required here, not imported: a build without the native module (an old dev client) would crash on start.
if (Platform.OS === "android") {
  try {
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    TaskManager.defineTask<Notifications.NotificationTaskPayload>(ANDROID_PUSH_TASK, async ({ data }) => {
      const fields = pushFields(data);
      if (fields) await show(fields).catch(() => {});
      return Notifications.BackgroundNotificationTaskResult.NoData;
    });
    void Notifications.registerTaskAsync(ANDROID_PUSH_TASK).catch(() => {});
  } catch {
    // No task manager in this build, so data-only pushes go unshown; the relay only sends them to builds that have it.
  }
}
