import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import type { GrytAppearance } from "@gryt/ui-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_APPEARANCE,
  isAppearance,
  resolveAppearance,
  type AppearancePreference,
} from "./appearanceChoice";

/**
 * How messages are drawn. An enum rather than a boolean: "Compact" reads like the off
 * position of a switch and is not, and `bubbles` is sketched as the third.
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
  appearance?: AppearancePreference;
}

export interface Appearance {
  messageLayout: MessageLayout;
  setMessageLayout: (layout: MessageLayout) => void;
  /**
   * Whether a message or a call makes a sound. On by default, as on the desktop: an
   * app that arrives silent is one where the first message is missed.
   */
  sounds: boolean;
  setSounds: (on: boolean) => void;
  /** What was chosen, including "system". This is what the picker draws. */
  appearance: AppearancePreference;
  setAppearance: (next: AppearancePreference) => void;
  /** The one to paint with: "system" resolved against the OS. See the resolver. */
  resolvedAppearance: GrytAppearance;
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
 * Read once at start, written on every change. No Save button, because nothing here
 * has one. The write is not awaited, so the list redraws under the finger.
 */
export function AppearanceProvider({ children }: { children?: ReactNode }) {
  const [messageLayout, setLayout] = useState<MessageLayout>(DEFAULT);
  const [sounds, setSoundsState] = useState(true);
  const [appearance, setAppearanceState] =
    useState<AppearancePreference>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);

  const system = useColorScheme();
  const resolvedAppearance = resolveAppearance(appearance, system);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const stored = raw ? (JSON.parse(raw) as Stored) : null;
        /* Checked against the list rather than trusted: a value written by a later
         * version has to fall back to something drawable, not a blank channel. */
        if (!cancelled && stored?.messageLayout && isLayout(stored.messageLayout)) {
          setLayout(stored.messageLayout);
        }
        if (!cancelled && typeof stored?.sounds === "boolean") {
          setSoundsState(stored.sounds);
        }
        /* Checked against the list for the same reason: an unreadable value paints
           the app in a theme that does not exist. */
        if (!cancelled && stored?.appearance && isAppearance(stored.appearance)) {
          setAppearanceState(stored.appearance);
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
   * Every field, every time. One key holds the whole object, so a setter writing only
   * its own field would silently turn the sounds back on.
   */
  const persist = useCallback((next: Stored) => {
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messageLayout, sounds, appearance, ...next } satisfies Stored),
    );
  }, [messageLayout, sounds, appearance]);

  const setMessageLayout = useCallback((layout: MessageLayout) => {
    setLayout(layout);
    persist({ messageLayout: layout });
  }, [persist]);

  const setSounds = useCallback((on: boolean) => {
    setSoundsState(on);
    persist({ sounds: on });
  }, [persist]);

  const setAppearance = useCallback((next: AppearancePreference) => {
    setAppearanceState(next);
    persist({ appearance: next });
  }, [persist]);

  const value = useMemo<Appearance>(
    () => ({
      messageLayout,
      setMessageLayout,
      sounds,
      setSounds,
      appearance,
      setAppearance,
      resolvedAppearance,
      ready,
    }),
    [
      messageLayout,
      setMessageLayout,
      sounds,
      setSounds,
      appearance,
      setAppearance,
      resolvedAppearance,
      ready,
    ],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function isLayout(value: string): value is MessageLayout {
  return MESSAGE_LAYOUTS.some((l) => l.value === value);
}

