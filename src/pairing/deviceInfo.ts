import { Platform } from "react-native";

import { PHONE_NAME } from "./device";

/** What this phone tells a device that links it: shown there as "Gryt mobile on iOS 26.0". */
export const PHONE_DEVICE_INFO = {
  name: PHONE_NAME,
  app: "Gryt mobile",
  platform: `${Platform.OS === "ios" ? "iOS" : "Android"} ${String(Platform.Version)}`,
};
