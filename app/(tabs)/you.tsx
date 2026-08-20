import { View } from "react-native";

/**
 * The route behind the avatar in the tab bar, which is never shown.
 *
 * The trigger for it is `disabled`, so tapping the tab emits `tabPress` and
 * navigates nowhere — `app/_layout.tsx` listens for that and opens the sheet
 * instead. The file exists because a trigger has to name a route that exists,
 * and because `router.push("/you")` still reaches it: `disabled` suppresses the
 * native tap and nothing else, which the router's own docs are blunt about.
 *
 * If it is ever shown, it is a bug, and an empty screen is a clearer symptom
 * than a duplicate of the sheet's contents drifting out of sync with it.
 */
export default function You() {
  return <View />;
}
