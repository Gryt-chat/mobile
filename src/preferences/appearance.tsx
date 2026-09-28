import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import type { GrytTheme } from "@gryt/theme";
import { grytThemeToOptions } from "@gryt/theme";
import type { GrytAppearance, NativeThemeOptions } from "@gryt/ui-native";
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
import { customThemeId, resolveActiveTheme, type SavedTheme } from "./appearanceTheme";

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
  activeThemeId?: string | null;
  customThemes?: SavedTheme[];
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

  /** The palette in use: a preset id, an imported theme's id, or null for Gryt's own. */
  activeThemeId: string | null;
  setActiveThemeId: (id: string | null) => void;
  /** Themes imported on this phone. The library's own presets are not stored here. */
  customThemes: SavedTheme[];
  /** Saves and selects it in one step, returning the id it was given. */
  saveTheme: (name: string, theme: GrytTheme) => string;
  /** Overwrites a theme already on this phone — the colour editor's write. */
  updateTheme: (id: string, theme: GrytTheme) => void;
  deleteTheme: (id: string) => void;
  /** `color`/`radius` for `GrytThemeProvider`, or null to leave the library's own. */
  themeOptions: Pick<NativeThemeOptions, "color" | "radius"> | null;
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
  const [activeThemeId, setActiveThemeIdState] = useState<string | null>(null);
  const [customThemes, setCustomThemes] = useState<SavedTheme[]>([]);
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
        if (!cancelled && Array.isArray(stored?.customThemes)) {
          setCustomThemes(stored.customThemes);
        }
        /* Read after the themes it points into, but the order does not matter here:
           both land before `ready`, and nothing draws with only one of them. */
        if (!cancelled && typeof stored?.activeThemeId === "string") {
          setActiveThemeIdState(stored.activeThemeId);
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
      JSON.stringify({
        messageLayout,
        sounds,
        appearance,
        activeThemeId,
        customThemes,
        ...next,
      } satisfies Stored),
    );
  }, [messageLayout, sounds, appearance, activeThemeId, customThemes]);

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

  const setActiveThemeId = useCallback((id: string | null) => {
    setActiveThemeIdState(id);
    persist({ activeThemeId: id });
  }, [persist]);

  const saveTheme = useCallback((name: string, theme: GrytTheme) => {
    const id = customThemeId();
    const entry: SavedTheme = { id, name, theme };
    setCustomThemes((current) => {
      const next = [...current, entry];
      persist({ customThemes: next, activeThemeId: id });
      return next;
    });
    setActiveThemeIdState(id);
    return id;
  }, [persist]);

  /** A no-op for an id that is not on this phone — the row that opened the
   * editor may already have been deleted from another screen. */
  const updateTheme = useCallback((id: string, theme: GrytTheme) => {
    setCustomThemes((current) => {
      if (!current.some((entry) => entry.id === id)) return current;
      const next = current.map((entry) => (entry.id === id ? { ...entry, theme } : entry));
      persist({ customThemes: next });
      return next;
    });
  }, [persist]);

  /** Falls back to Gryt's own when the theme deleted was the one in use — there is
   * nothing left to paint the app with otherwise. */
  const deleteTheme = useCallback((id: string) => {
    setCustomThemes((current) => {
      const next = current.filter((entry) => entry.id !== id);
      persist({
        customThemes: next,
        activeThemeId: activeThemeId === id ? null : activeThemeId,
      });
      return next;
    });
    if (activeThemeId === id) setActiveThemeIdState(null);
  }, [persist, activeThemeId]);

  const activeTheme = useMemo(
    () => resolveActiveTheme(activeThemeId, customThemes),
    [activeThemeId, customThemes],
  );

  const themeOptions = useMemo(() => {
    if (activeTheme === null) return null;
    const options = grytThemeToOptions(activeTheme, resolvedAppearance);
    return { color: options.color, radius: options.radius };
  }, [activeTheme, resolvedAppearance]);

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
      activeThemeId,
      setActiveThemeId,
      customThemes,
      saveTheme,
      updateTheme,
      deleteTheme,
      themeOptions,
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
      activeThemeId,
      setActiveThemeId,
      customThemes,
      saveTheme,
      updateTheme,
      deleteTheme,
      themeOptions,
    ],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function isLayout(value: string): value is MessageLayout {
  return MESSAGE_LAYOUTS.some((l) => l.value === value);
}

