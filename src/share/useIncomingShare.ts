import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { consumeShare, onShareReceived } from "../../modules/share-intent";
import { droppedCount, normalizeShare, type IncomingShare } from "./incoming";

/**
 * Notice when another app has shared something to Gryt. Three moments, all
 * three needed:
 *
 * 1. **Mount.** A cold start launched *by* a share has the share waiting before
 *    any JavaScript runs. Android holds it on the Activity's launch Intent; iOS
 *    has it sitting in the shared container.
 * 2. **Foreground.** iOS delivers a share by bringing the app to the front. If
 *    Gryt was already running there is no launch and no event.
 * 3. **The module's own event.** Android can deliver a share to an app that is
 *    already in front, where the state never leaves `active`.
 *
 * Consuming is safe to do repeatedly: the native side hands a share over once
 * and answers null afterwards.
 */
export function useIncomingShare(
  onShare: (share: IncomingShare, dropped: number) => void,
): void {
  /* Out of the effect's closure so the listeners, which outlive a render, call
   * the current one rather than the one from when they were attached. */
  const handler = useRef(onShare);
  handler.current = onShare;

  useEffect(() => {
    const check = () => {
      const raw = consumeShare();
      const share = normalizeShare(raw);
      if (share) handler.current(share, droppedCount(raw));
    };

    check();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    const unwatch = onShareReceived(check);

    return () => {
      subscription.remove();
      unwatch();
    };
  }, []);
}
