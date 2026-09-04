import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * Android's back button closes the thing that is open, rather than the app.
 * **The bug is not "back does nothing"**: a `Sheet` is part of the React tree,
 * so back falls through to the navigator and Android takes that as leave. A
 * `Drawer` *is* a `Modal` and does not need this.
 *
 * **Registration order is the stacking order** — `BackHandler` runs listeners
 * newest-first. iOS registers nothing.
 */
export function useBackToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      /* True means handled. Without it the event carries on to the navigator
       * and closes the sheet *and* leaves the screen, which is two things for
       * one press. */
      return true;
    });

    return () => subscription.remove();
  }, [open, close]);
}
