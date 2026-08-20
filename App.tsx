import { StatusBar } from "expo-status-bar";
import { GrytThemeProvider, ToastProvider, TooltipProvider } from "@gryt/ui-native";
import { Gallery } from "./src/Gallery";

/**
 * Dark with no system following, deliberately. Gryt is a dark product and the
 * light theme is the exception rather than the default — matching what
 * GrytProvider does on the web, which ships dark unless told otherwise.
 */
export default function App() {
  return (
    <GrytThemeProvider appearance="dark">
      <TooltipProvider>
        <ToastProvider>
          <StatusBar style="light" />
          <Gallery />
        </ToastProvider>
      </TooltipProvider>
    </GrytThemeProvider>
  );
}
