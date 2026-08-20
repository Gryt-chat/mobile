import { Stack } from "expo-router";

/**
 * The Server tab's own stack.
 *
 * A channel is pushed here rather than at the root, so the tab bar stays
 * visible while you read one — which is what the reference does, and what a
 * native tab bar is for. Pushing at the root would cover the bar, and then
 * leaving a channel would be the only way back to Search.
 *
 * Headers are off because both screens draw their own: the server header is
 * painted in the server's colour and the channel header carries a member
 * count, and a `UINavigationBar` would have to be lied to about both.
 */
export default function ServerStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
