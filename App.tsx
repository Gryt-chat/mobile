import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { GrytThemeProvider, ToastProvider, TooltipProvider } from "@gryt/ui-native";
import { DevCatalogue } from "./src/dev/DevCatalogue";

/**
 * GestureHandlerRootView has to be the outermost view, and has to have flex: 1.
 * On Android, gestures below a missing root simply never fire — no error, no
 * warning, the component just does not respond. iOS is more forgiving, which is
 * exactly why this is easy to ship broken.
 *
 * Dark with no system following, deliberately. Gryt is a dark product and the
 * light theme is the exception rather than the default — matching what
 * GrytProvider does on the web, which ships dark unless told otherwise.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GrytThemeProvider appearance="dark">
        <TooltipProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <DevCatalogue />
          </ToastProvider>
        </TooltipProvider>
      </GrytThemeProvider>
    </GestureHandlerRootView>
  );
}
