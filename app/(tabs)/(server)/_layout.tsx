import { Stack } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { ServerScreen } from "../../../src/shell/ServerScreen";
import { SIDEBAR_WIDTH, useTwoPane } from "../../../src/shell/twoPane";

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
 *
 * `animation: "none"` because opening a channel should be a jump, the way
 * following a link in a browser is. The default slide is a phone convention
 * borrowed from navigating *into* something, and a channel is somewhere you
 * flick between rather than descend into — the animation is time spent watching
 * a transition on every single switch.
 *
 * The back gesture is unaffected: it is `gestureEnabled`, not the animation, so
 * swiping from the left edge still works.
 *
 * ---
 *
 * Wide enough, and the list stops being somewhere you go. `ServerScreen` is
 * rendered *beside* the stack rather than inside it, so picking a channel
 * changes only the right-hand side and the list never slides away.
 *
 * The stack is still the stack. `router.push("/channel/[id]")` is the same call
 * on a phone and on a tablet, and nothing that navigates had to learn which one
 * it is on — the pushed screen simply lands in a narrower box. The same
 * `<Stack>` element is used by both branches rather than one each, because
 * swapping between two of them on a rotation would remount the channel and lose
 * where you were in it.
 *
 * `index.tsx` is what keeps the list from being drawn twice: it renders the
 * empty state instead of `ServerScreen` when there are two panes.
 */
export default function ServerStackLayout() {
  const theme = useTheme();
  const twoPane = useTwoPane();

  const stack = <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
  if (!twoPane) return stack;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.color.bg }}>
      <View
        style={{
          width: SIDEBAR_WIDTH,
          borderRightWidth: 1,
          borderRightColor: theme.color.border,
        }}
      >
        <ServerScreen />
      </View>
      <View style={{ flex: 1 }}>{stack}</View>
    </View>
  );
}
