import { Platform } from "react-native";

/** What this phone calls itself to a device it links, as the MLS device name does. */
export const PHONE_NAME = Platform.OS === "ios" ? (Platform.isPad ? "iPad" : "iPhone") : "Android phone";
