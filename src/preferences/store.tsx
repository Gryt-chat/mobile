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
 * What you have told the app to do, as opposed to what you are doing now.
 *
 * The distinction is the whole reason this is not part of `VoiceState`. `muted`
 * in the shell is whether your microphone is off *right now* and it changes as
 * you press the button; `joinMuted` is what that should be set to the next time
 * you join something, and it survives the app being closed.
 *
 * One field, and it is worth saying why there is only one. Most of what a
 * preferences page would obviously hold is not reachable yet: output volume,
 * the noise gate and automatic gain all need an audio graph the phone does not
 * have — `voiceConfigFrom` says so field by field — and notifications need push
 * registration that exists neither in this app nor on the server. "Join
 * deafened" is the near miss: deafen itself did nothing on a phone until
 * GRYT-486, and offering a preference for it before that shipped would have
 * been a switch for a button that was not working.
 */
export interface Preferences {
  /** Your microphone starts off when you join a voice channel. */
  joinMuted: boolean;
}

const DEFAULTS: Preferences = {
  joinMuted: false,
};

const STORAGE_KEY = "preferences";

interface PreferencesValue {
  preferences: Preferences;
  /** False until the first read finishes, so a switch does not flick on load. */
  ready: boolean;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error("usePreferences must be used inside PreferencesProvider.");
  }
  return value;
}

export function PreferencesProvider({ children }: { children?: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          /* Spread over the defaults rather than replacing them, so a build
             that adds a field reads an older file without every new preference
             coming back undefined. */
          setPreferences({ ...DEFAULTS, ...(parsed as Partial<Preferences>) });
        }
      })
      .catch(() => {
        // Unreadable storage is the defaults, not a crash. Same call as the
        // server list makes: a preference is not worth failing to start over.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback<PreferencesValue["set"]>((key, value) => {
    setPreferences((previous) => {
      const next = { ...previous, [key]: value };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // Kept for this run. Losing it on restart beats refusing the toggle
        // that has already visibly moved.
      });
      return next;
    });
  }, []);

  const value = useMemo<PreferencesValue>(
    () => ({ preferences, ready, set }),
    [preferences, ready, set],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}
