import { Stack } from "expo-router";

/** The Messages tab's own stack, so a conversation opened here stays on this tab (GRYT-1766). */
export default function MessagesStackLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
}
