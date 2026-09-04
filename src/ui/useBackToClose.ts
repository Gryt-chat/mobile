import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * Android's back button closes the thing that is open, rather than the app.
 *
 * **The bug is not "back does nothing".** A `Sheet` is part of the React tree
 * rather than a window, so back falls through to the navigator, which has
 * nothing to pop at the root — and Android takes that as leave-the-app.
 *
 * A `Drawer` does not need this: it *is* a React Native `Modal`, and the
 * library already gives it `onRequestClose`.
 *
 * **Registration order is the stacking order.** `BackHandler` runs listeners
 * newest-first, so a sheet over another sheet closes first and nothing has to
 * know what else is open. iOS registers nothing.
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
