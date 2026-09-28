import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "gryt.onboardingTour";

/**
 * Whether the tour has run to the end or been skipped. Read once and cached in
 * memory, the same shape `Welcome` uses: null until storage answers.
 */
export async function getTourSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === "true";
  } catch {
    // Unreadable is the same as unset: nothing was recorded, so nothing is seen.
    return false;
  }
}

export async function setTourSeen(seen: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, seen ? "true" : "false");
  } catch {
    // Kept for this run only. Worse than a persisted flag, not worse than a crash.
  }
}

/** Loads the seen flag once. Null until storage has answered. */
export function useTourSeen(): boolean | null {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTourSeen().then((value) => {
      if (!cancelled) setSeen(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return seen;
}

type Listener = () => void;
let visible = false;
const listeners = new Set<Listener>();

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  listeners.forEach((listener) => listener());
}

/** The plain getter behind `useTourVisible`, for anything that is not a component. */
export function isTourVisible(): boolean {
  return visible;
}

/**
 * Module-scoped, like `tourTargets`'s registry: the "Show the tour again" row lives
 * in the settings slice, nowhere near `OnboardingTour`'s own mount point.
 */
export function useTourVisible(): boolean {
  const [state, setState] = useState(visible);

  useEffect(() => {
    const listener = () => setState(visible);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}

export function startTour(): void {
  setVisible(true);
}

export function hideTour(): void {
  setVisible(false);
}

/**
 * Finishing and skipping are the same statement, same as the desktop's
 * `dismissTour`: both close the overlay and record it as seen.
 */
export function finishTour(): void {
  hideTour();
  void setTourSeen(true);
}

/**
 * For the settings slice's "Show the tour again" row: un-sees it and opens it right
 * now, since a manual replay will not get another first-join transition to ride on.
 */
export function resetTour(): void {
  void setTourSeen(false);
  startTour();
}

/** One join, watched across renders without losing it to a state update in between. */
export interface JoinWatcher {
  prevCount: number;
  pending: boolean;
}

export function initJoinWatcher(serverCount: number): JoinWatcher {
  return { prevCount: serverCount, pending: false };
}

/** Call on every server-count change. A 0-to-something move is remembered until
 * `consumePendingJoin` reads it, however many renders that takes. */
export function noteServerCount(watcher: JoinWatcher, serverCount: number): JoinWatcher {
  const pending = watcher.pending || (watcher.prevCount === 0 && serverCount > 0);
  return { prevCount: serverCount, pending };
}

/**
 * Consumes a pending join once the seen flag has answered false. Returns whether to
 * start the tour, and the watcher with the join marked handled either way.
 */
export function consumePendingJoin(
  watcher: JoinWatcher,
  seen: boolean | null,
): { watcher: JoinWatcher; start: boolean } {
  if (seen === false && watcher.pending) {
    return { watcher: { ...watcher, pending: false }, start: true };
  }
  return { watcher, start: false };
}

/**
 * Starts the tour on the first zero-to-positive move of `serverCount`, if the flag
 * says unseen. An existing install already past zero never gets that transition.
 */
export function useAutoStartTourOnFirstJoin(serverCount: number, seen: boolean | null): void {
  const watcherRef = useRef<JoinWatcher>(initJoinWatcher(serverCount));

  useEffect(() => {
    watcherRef.current = noteServerCount(watcherRef.current, serverCount);
    const result = consumePendingJoin(watcherRef.current, seen);
    watcherRef.current = result.watcher;
    if (result.start) startTour();
  }, [serverCount, seen]);
}
