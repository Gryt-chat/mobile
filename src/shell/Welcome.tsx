import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Button, Dialog, Text, useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";

const STORAGE_KEY = "gryt.welcome";

interface Stored {
  seen?: boolean;
}

interface WelcomeValue {
  /** Null until storage has answered, so nothing decides on a guess. */
  seen: boolean | null;
  complete: () => void;
}

const WelcomeContext = createContext<WelcomeValue | null>(null);

function useWelcomeState(): WelcomeValue {
  const value = useContext(WelcomeContext);
  if (!value) throw new Error("useWelcomeState must be used inside WelcomeProvider.");
  return value;
}

/**
 * Whether the greeting has been shown, kept out of component state. `seen` starts null
 * rather than false, or every cold start flashes the welcome for a frame.
 */
export function WelcomeProvider({ children }: { children?: ReactNode }) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const stored = raw ? (JSON.parse(raw) as Stored) : null;
        if (!cancelled) setSeen(stored?.seen === true);
      } catch {
        /* Unreadable is the same as unset: greet them. Showing it twice is a
           smaller failure than never showing it at all. */
        if (!cancelled) setSeen(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Marked seen in state first, so the dialog closes on the tap. **The write is
   * awaited and its failure caught**, and retried once.
   */
  const complete = useCallback(() => {
    setSeen(true);

    void (async () => {
      const stored = JSON.stringify({ seen: true } satisfies Stored);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await AsyncStorage.setItem(STORAGE_KEY, stored);
          return;
        } catch {
          /* Falls through to the retry, then to the warning. */
        }
      }
      console.warn(
        "[Welcome] could not record the greeting as seen; it will show again next launch",
      );
    })();
  }, []);

  const value = useMemo(() => ({ seen, complete }), [seen, complete]);
  return <WelcomeContext.Provider value={value}>{children}</WelcomeContext.Provider>;
}

/**
 * The first thing anybody sees — a message rather than a dialog, in the app's own idiom.
 * There is no tour on mobile yet, so no "Show me around"; both come back together.
 */
export function Welcome() {
  const theme = useTheme();
  const { seen, complete } = useWelcomeState();

  return (
    <Dialog.Root
      open={seen === false}
      onOpenChange={(open) => {
        /* Closing by the backdrop is still a decision to move on. Guarded on `open`,
           or `complete` would dismiss it as it opened. */
        if (!open) complete();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup scrollable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
            {/* `PersonAvatar`, not `Avatar`: its whole rule is "draw from the
                nickname, and never a letter tile", and a letter tile is what a
                bare `Avatar name=` gives. The desktop passes the Gryt mark
                here; an owl drawn from the name is the same idea in the idiom
                this app actually uses for people. */}
            <PersonAvatar name="Sivert" size={44} />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: theme.color.text, fontWeight: "600" }}>Sivert</Text>
              <Text style={{ fontSize: 12, color: theme.color.muted }}>Maintains Gryt</Text>
            </View>
          </View>

          {/* The bubble is drawn rather than imported: `@gryt/ui` has a
              MessageBubble and `@gryt/ui-native` does not, and one surface with
              a radius is not worth a component in the shared package until
              something else needs it. Raised for the same reason the desktop
              overrides its fill — on the dialog's own surface it would be a
              border and nothing else. */}
          <View
            style={{
              marginTop: theme.space(4),
              padding: theme.space(4),
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.surfaceRaised,
              gap: theme.space(3),
            }}
          >
            <Text style={{ color: theme.color.text }}>Hey there! 👋 Welcome to Gryt!</Text>
            <Text style={{ color: theme.color.text }}>
              I&rsquo;m really glad you&rsquo;re here, and that you decided to give it a go.
              It&rsquo;s all built by me, a senior product engineer from Norway 🇳🇴
            </Text>
            <Text style={{ color: theme.color.text }}>
              It&rsquo;s just me keeping it running, so some things are still a bit rough
              around the edges. If something breaks, please tell me. There&rsquo;s a Give
              feedback button in settings.
            </Text>
            <Text style={{ color: theme.color.text }}>Enjoy Gryt! 😊</Text>
          </View>

          <View style={{ marginTop: theme.space(4) }}>
            <Button onPress={complete}>Get started</Button>
          </View>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
