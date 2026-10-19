import { Platform } from "react-native";

/** What this phone calls itself to a device it links, as the MLS device name does. */
const APPLE_NAME = Platform.OS === "ios" && Platform.isPad ? "iPad" : "iPhone";
export const PHONE_NAME = Platform.OS === "ios" ? APPLE_NAME : "Android phone";
