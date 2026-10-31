import { PreferencesScreen } from "../../../src/preferences/PreferencesScreen";
import { YouScreen } from "../../../src/shell/YouScreen";
import { useTwoPane } from "../../../src/shell/twoPane";

/** Your card on a phone. Open it's already on the left, so this is the settings beside it. */
export default function YouIndex() {
  return useTwoPane() ? <PreferencesScreen embedded /> : <YouScreen />;
}
