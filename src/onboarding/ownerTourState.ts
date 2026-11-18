import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const STORAGE_KEY = "gryt.ownerTour";

type Listener = () => void;
let visible = false;
const listeners = new Set<Listener>();

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  listeners.forEach((listener) => listener());
}

export function useOwnerTourVisible(): boolean {
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

export function startOwnerTour(): void {
  setVisible(true);
}

export function finishOwnerTour(): void {
  setVisible(false);
  // Unwritable storage only means it may show once more.
  AsyncStorage.setItem(STORAGE_KEY, "true").catch(() => undefined);
}

/** Starts the owner tour the first time this person owns a server, unless the first-run tour is up. */
export function useAutoStartOwnerTour(isOwner: boolean, firstTourVisible: boolean): void {
  useEffect(() => {
    if (!isOwner || firstTourVisible || visible) return;
    let live = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((seen) => {
        if (live && seen !== "true") startOwnerTour();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [isOwner, firstTourVisible]);
}
