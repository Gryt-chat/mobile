import { useEffect, useState } from "react";
import { useWindowDimensions, type ViewStyle } from "react-native";

import { currentFold, type FoldRect } from "../../modules/fold-region";
import { TWO_PANE_MIN_WIDTH, useSideStrip } from "./twoPane";

const POLL_MS = 500;

let latest: FoldRect | null = null;
const listeners = new Set<(fold: FoldRect | null) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function read() {
  void currentFold().then((next) => {
    const same =
      latest?.x === next?.x && latest?.y === next?.y && latest?.width === next?.width && latest?.height === next?.height;
    if (same) return;
    latest = next;
    listeners.forEach((listener) => listener(next));
  });
}

/**
 * The fold while half open, or null when flat. One timer however many ask.
 * shortcut: polls because folding changes no window size, move to a native event if it ever shows up in profiling.
 */
export function useFold(): FoldRect | null {
  const wide = useWindowDimensions().width >= TWO_PANE_MIN_WIDTH;
  const [fold, setFold] = useState<FoldRect | null>(latest);

  useEffect(() => {
    if (!wide) return;
    setFold(latest);
    listeners.add(setFold);
    if (!timer) {
      read();
      timer = setInterval(read, POLL_MS);
    }
    return () => {
      listeners.delete(setFold);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [wide]);

  return wide ? fold : null;
}

/** A fold running top to bottom, which is the only kind that moves the panes. */
export function useBookFold(): FoldRect | null {
  const fold = useFold();
  return fold && fold.height > fold.width ? fold : null;
}

/** The half past a book fold, where anything that would sit on the fold goes instead. */
export function useFoldPane(): { left: number; width: number } | null {
  const fold = useBookFold();
  const window = useWindowDimensions();
  const strip = useSideStrip();
  if (!fold) return null;
  const left = fold.x + fold.width;
  return { left, width: window.width - left - strip };
}

/** For something centred on the screen: slides it off the fold, into the right or lower half. */
export function useOffFold(): ViewStyle | null {
  const fold = useFold();
  const pane = useFoldPane();
  const window = useWindowDimensions();
  if (!fold) return null;
  if (pane) {
    return {
      maxWidth: pane.width - 32,
      transform: [{ translateX: pane.left + pane.width / 2 - window.width / 2 }],
    };
  }
  const top = fold.y + fold.height;
  return { maxHeight: window.height - top - 32, transform: [{ translateY: (top + window.height) / 2 - window.height / 2 }] };
}

const SHEET_WIDTH = 480;

/** Where a bottom sheet goes on a wide screen: on the right, clear of the fold and the side strip. */
export function useSheetInsets(): { left: number; right: number } {
  const pane = useFoldPane();
  const window = useWindowDimensions();
  const strip = useSideStrip();
  if (pane) return { left: pane.left, right: strip };
  if (window.width < TWO_PANE_MIN_WIDTH) return { left: 0, right: 0 };
  return { left: window.width - strip - SHEET_WIDTH, right: strip };
}
