import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * How messages are drawn, and nothing else yet.
 *
 * The first real preference in the app. Every earlier candidate turned out to
 * be something the engine could not read or something that was not a
 * preference at all — the note on `PreferencesScreen` has the list. This one
 * clears that bar: two layouts, both drawn from the same messages, and the
 * choice is a matter of taste rather than of capability.
 *
 * **An enum rather than a boolean.** "Compact" reads like the off position of a
 * switch and it is not — it is one of a set, and `bubbles` is already sketched
 * as the third. A boolean would have to be migrated the day that lands, and a
 * stored `false` would have to be interpreted rather than read.
 */
export type MessageLayout = "cozy" | "compact";

export const MESSAGE_LAYOUTS: { value: MessageLayout; label: string; hint: string }[] = [
  {
    value: "cozy",
    label: "Cozy",
    hint: "Avatars, and a run of messages from one person grouped under one name.",
  },
  {
    value: "compact",
    label: "Compact",
    hint: "No avatars. More room for the words, and more of them on screen.",
  },
];

const STORAGE_KEY = "appearance";
const DEFAULT: MessageLayout = "cozy";

interface Stored {
  messageLayout?: MessageLayout;
}

export interface Appearance {
  messageLayout: MessageLayout;
  setMessageLayout: (layout: MessageLayout) => void;
  /** False until storage has answered, so nothing draws the wrong one first. */
  ready: boolean;
}

const AppearanceContext = createContext<Appearance | null>(null);

export function useAppearance(): Appearance {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider.");
  return value;
}

/**
 * Read once at start, written on every change.
 *
 * No Save button, because nothing in this app has one: a setting is committed
 * when it is changed. The write is not awaited by the setter — the state moves
 * first so the list redraws under the finger, and storage catches up. Losing
 * the write on a crash in that window costs one tap.
 */
export function AppearanceProvider({ children }: { children?: ReactNode }) {
  const [messageLayout, setLayout] = useState<MessageLayout>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const stored = raw ? (JSON.parse(raw) as Stored) : null;
        /* Checked against the list rather than trusted. A value written by a
         * later version of the app — `bubbles`, once it exists — has to fall
         * back to something drawable rather than to a layout with no renderer,
         * which is a blank channel. */
        if (!cancelled && stored?.messageLayout && isLayout(stored.messageLayout)) {
          setLayout(stored.messageLayout);
        }
      } catch {
        /* Unreadable or unparseable is the same as unset. */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setMessageLayout = useCallback((layout: MessageLayout) => {
    setLayout(layout);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ messageLayout: layout }));
  }, []);

  const value = useMemo<Appearance>(
    () => ({ messageLayout, setMessageLayout, ready }),
    [messageLayout, setMessageLayout, ready],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function isLayout(value: string): value is MessageLayout {
  return MESSAGE_LAYOUTS.some((l) => l.value === value);
}
