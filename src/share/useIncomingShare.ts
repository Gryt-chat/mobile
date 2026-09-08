import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { consumeShare, onShareReceived } from "../../modules/share-intent";
import { droppedCount, normalizeShare, type IncomingShare } from "./incoming";

/**
 * Notice when another app has shared something to Gryt. Three moments, all needed: a cold
 * start, iOS foregrounding, and Android's own event. Consuming twice is safe.
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
