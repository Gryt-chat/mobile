import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * Android's back button closes the thing that is open, rather than the app.
 *
 * **The bug this fixes is not "back does nothing".** A `Sheet` is
 * `@gorhom/bottom-sheet` rendered through a portal — it is part of the React
 * tree rather than a window of its own — so Android's back never reaches it. It
 * falls through to the navigator, which has nothing to pop at the root, and
 * Android takes that as leave-the-app. Measured on an emulator: open the
 * add-server sheet, press back, and you are on the home screen with Gryt in the
 * background.
 *
 * A `Drawer` does not need this. That one *is* a React Native `Modal`, which is
 * a real window, and the library already gives it `onRequestClose` — the server
 * switcher and the members drawer close on back without anything here.
 *
 * **Registration order is the stacking order.** `BackHandler` runs its
 * listeners newest-first, so a sheet opened over another sheet closes first,
 * which is what the gesture means. Nothing has to know about anything else
 * being open.
 *
 * iOS registers nothing: `BackHandler` exists there and does nothing, and a
 * listener that can never fire is a listener somebody has to reason about
 * later.
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
