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
  sounds?: boolean;
}

export interface Appearance {
  messageLayout: MessageLayout;
  setMessageLayout: (layout: MessageLayout) => void;
  /**
   * Whether a message or a call makes a sound.
   *
   * On by default, which is the desktop's answer too. A chat app that arrives
   * silent is one where the first message is missed and the setting is never
   * found — and the switch is one tap away for anybody who disagrees.
   */
  sounds: boolean;
  setSounds: (on: boolean) => void;
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
  const [sounds, setSoundsState] = useState(true);
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
        if (!cancelled && typeof stored?.sounds === "boolean") {
          setSoundsState(stored.sounds);
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

  /**
   * Both fields, every time.
   *
   * One key holds the whole object, so a setter that wrote only its own field
   * would erase the other — changing the layout would silently turn the sounds
   * back on. That was true the moment this stopped holding one setting, and it
   * is the kind of thing that shows up a week later as "my setting keeps
   * resetting".
   */
  const persist = useCallback((next: Stored) => {
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messageLayout, sounds, ...next } satisfies Stored),
    );
  }, [messageLayout, sounds]);

  const setMessageLayout = useCallback((layout: MessageLayout) => {
    setLayout(layout);
    persist({ messageLayout: layout });
  }, [persist]);

  const setSounds = useCallback((on: boolean) => {
    setSoundsState(on);
    persist({ sounds: on });
  }, [persist]);

  const value = useMemo<Appearance>(
    () => ({ messageLayout, setMessageLayout, sounds, setSounds, ready }),
    [messageLayout, setMessageLayout, sounds, setSounds, ready],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function isLayout(value: string): value is MessageLayout {
  return MESSAGE_LAYOUTS.some((l) => l.value === value);
}
