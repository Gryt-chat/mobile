import { useEffect, useRef, useState } from "react";

/** How long a close has to wait so the sheet has finished opening first. */
export function closeDelay(openedAt: number | null, now: number, settleMs: number): number {
  return openedAt === null ? 0 : Math.max(0, openedAt + settleMs - now);
}

/** `open`, with a close held back until the opening has run for `settleMs`. A Sheet told to
    close while it is still presenting ignores it and stays up with nothing behind it. */
export function useSettledOpen(open: boolean, settleMs: number): boolean {
  const [shown, setShown] = useState(open);
  const openedAt = useRef<number | null>(open ? Date.now() : null);

  useEffect(() => {
    if (open) {
      openedAt.current = Date.now();
      setShown(true);
      return;
    }
    const wait = closeDelay(openedAt.current, Date.now(), settleMs);
    openedAt.current = null;
    if (wait === 0) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(false), wait);
    return () => clearTimeout(timer);
  }, [open, settleMs]);

  return shown;
}
