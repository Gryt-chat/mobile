import { useEffect, useState } from "react";

import { currentFold, type FoldRect } from "../../modules/fold-region";
import { useTwoPane } from "./twoPane";

const POLL_MS = 500;

/**
 * The fold while half open, or null when flat. Only asked when open.
 * shortcut: polls because folding changes no window size, move to a native event if it ever shows up in profiling.
 */
export function useFold(): FoldRect | null {
  const open = useTwoPane();
  const [fold, setFold] = useState<FoldRect | null>(null);

  useEffect(() => {
    if (!open) {
      setFold(null);
      return;
    }
    let live = true;
    const read = () =>
      void currentFold().then((next) => {
        if (!live) return;
        setFold((now) =>
          now?.x === next?.x && now?.y === next?.y && now?.width === next?.width && now?.height === next?.height
            ? now
            : next,
        );
      });
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [open]);

  return fold;
}

/** A fold running top to bottom, which is the only kind that moves the panes. */
export function useBookFold(): FoldRect | null {
  const fold = useFold();
  return fold && fold.height > fold.width ? fold : null;
}
