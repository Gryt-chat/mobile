import { useEffect, useSyncExternalStore } from "react";

let holds = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

/** While held, no server asks about notifications, so the prompt can't cover a screen mid-task. */
export function holdPushAsk(): () => void {
  holds++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    emit();
  };
}

export function useHoldPushAsk(): void {
  useEffect(() => holdPushAsk(), []);
}

export const pushAskHeld = (): boolean => holds > 0;

export function usePushAskHeld(): boolean {
  return useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), pushAskHeld);
}
