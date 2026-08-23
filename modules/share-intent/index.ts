import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";

import type { RawShare } from "../../src/share/incoming";

/**
 * What another app handed to Gryt.
 *
 * The two platforms deliver a share in shapes with nothing in common — Android
 * as `Intent` extras on the Activity, iOS as files a separate extension process
 * copied into a shared container — and both are flattened to `RawShare` on the
 * native side so the app only has one of them to reason about.
 *
 * **Optional, like the other local modules.** Null in tests and on any build
 * older than this module. A share sheet that cannot be answered is worth far
 * less than an app that starts, so everything here reads as "nothing was
 * shared" rather than throwing.
 */

interface ShareIntentModule {
  consume(): RawShare | null;
  addListener(
    event: "onShare",
    listener: (payload: { waiting: boolean }) => void,
  ): EventSubscription;
}

const native = requireOptionalNativeModule<ShareIntentModule>("ShareIntent");

/** Whether this build can be shared to at all. */
export const shareIntentAvailable = native !== null;

/**
 * The share waiting to be dealt with, or null.
 *
 * **Consuming, not peeking.** Calling this twice returns the share once — the
 * second call is null. That is deliberate on both platforms: Android's launch
 * Intent and iOS's manifest both persist until something clears them, and a
 * share offered again on every foreground looks exactly like somebody sharing
 * the same picture over and over.
 *
 * Null is the ordinary answer. Every launch asks.
 */
export function consumeShare(): RawShare | null {
  return native?.consume() ?? null;
}

/**
 * Called when a share arrives while the app is already running.
 *
 * Android only, in practice: iOS delivers a share by bringing the app to the
 * front, which the app notices anyway. Returns a no-op where there is no
 * module, so an effect can return it unconditionally.
 */
export function onShareReceived(listener: () => void): () => void {
  if (!native) return () => {};
  const subscription = native.addListener("onShare", () => listener());
  return () => subscription.remove();
}
