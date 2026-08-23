import { Platform } from "react-native";
import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";

/**
 * Asking iOS to start a broadcast, and finding out whether it did.
 *
 * There is no API for "share my screen". `RPSystemBroadcastPickerView` is the
 * only entry point and it is a view, so this module puts one on screen and
 * presses it — `BroadcastPickerModule.swift` has the details and the caveat.
 * `onCaptureChange` is the other half: the tap opens a sheet, and whether
 * anything came of it is a separate question with a separate answer.
 *
 * **Optional, like the other two local modules.** Null on Android, in tests, and
 * on any build made before this module existed. Everything here treats null as
 * "cannot share" rather than throwing, because a voice sheet that will not open
 * is a much worse bug than a screen share button that says it is unavailable.
 */

interface BroadcastPickerModule {
  available: boolean;
  extensionBundleId: string | null;
  captured: boolean;
  present(): boolean;
  addListener(
    event: "onCaptureChange",
    listener: (payload: { captured: boolean }) => void,
  ): EventSubscription;
}

const native = requireOptionalNativeModule<BroadcastPickerModule>("BroadcastPicker");

/** Whether this build can start a broadcast at all. */
export const broadcastPickerAvailable =
  Platform.OS === "ios" && native !== null && native.available;

/**
 * Show the system sheet, already pointed at Gryt's extension.
 *
 * False means the picker could not be opened — say so rather than leaving the
 * button looking pressed.
 */
export function presentBroadcastPicker(): boolean {
  return native?.present() ?? false;
}

/** Whether the screen is being captured right now. */
export function screenIsCaptured(): boolean {
  return native?.captured ?? false;
}

/**
 * Called when capture starts or stops, including when nobody asked — somebody
 * ending the broadcast from the status bar, or the system ending it for them.
 *
 * Returns a function that stops listening, and a no-op where there is no
 * module, so an effect can return it unconditionally.
 */
export function onScreenCaptureChange(
  listener: (captured: boolean) => void,
): () => void {
  if (!native) return () => {};
  const subscription = native.addListener("onCaptureChange", ({ captured }) =>
    listener(captured),
  );
  return () => subscription.remove();
}
