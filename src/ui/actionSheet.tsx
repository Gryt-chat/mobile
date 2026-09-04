import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ActionSheetIOS, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme } from "@gryt/ui-native";

/**
 * A list of choices over whatever is already on screen. Four things asked a
 * question this way through `ActionSheetIOS`, and the three different
 * `Platform.OS !== "ios"` guards each did something wrong on Android — no way
 * to leave a server, confirmations skipped, a prompt that never asked.
 *
 * **The reason iOS uses a UIKit sheet survives.** A React Native `Modal`
 * presented while another is still dismissing is dropped there, which is how
 * leaving a server from the switcher came to do nothing at all.
 *
 * **Android is a plain `Modal`, deliberately, not the library's `Sheet`.**
 * `Sheet` portals into `SheetProvider`, which sits *outside* the switcher's
 * `Drawer` — and a portal target outside a `Modal` draws behind it, which would
 * reproduce the original bug on the other platform.
 */

export interface ActionSheetOptions {
  title?: string;
  message?: string;
  /** In order. The index of the one chosen is what comes back. */
  options: string[];
  /**
   * Drawn in the danger colour. A list when more than one is — the member
   * sheet can offer kick, ban and block at once, and colouring only the first
   * of the three says the other two are ordinary.
   */
  destructiveButtonIndex?: number | number[];
  /** Set apart, and what a dismissal resolves to. */
  cancelButtonIndex?: number;
}

type Present = (options: ActionSheetOptions) => Promise<number>;

const ActionSheetContext = createContext<Present | null>(null);

/**
 * Ask, and wait for the answer.
 *
 * A promise rather than a callback because two of the four call sites are
 * plain functions rather than components, and threading a presenter into them
 * would have made this change bigger than the thing it fixes.
 *
 * Dismissing resolves to `cancelButtonIndex`, and to -1 when there is not one.
 * Callers therefore only ever have to check for the index they care about.
 */
export function useActionSheet(): Present {
  const present = useContext(ActionSheetContext);
  if (!present) throw new Error("useActionSheet must be used inside ActionSheetHost.");
  return present;
}

/**
 * Mounted once, at the root.
 *
 * On iOS it is a passthrough that renders nothing: UIKit owns the presentation
 * and there is no React tree to put anywhere. The provider still exists there
 * so that a call site is written one way rather than two.
 */
export function ActionSheetHost({ children }: { children?: ReactNode }) {
  const [request, setRequest] = useState<ActionSheetOptions | null>(null);
  /* The resolver for the sheet that is currently up. A ref rather than state
   * because settling it must not wait for a render. */
  const settle = useRef<((index: number) => void) | null>(null);

  const finish = useCallback((index: number) => {
    const resolve = settle.current;
    settle.current = null;
    setRequest(null);
    resolve?.(index);
  }, []);

  const present = useCallback<Present>((options) => {
    if (Platform.OS === "ios") {
      return new Promise((resolve) => {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: options.title,
            message: options.message,
            options: options.options,
            destructiveButtonIndex: options.destructiveButtonIndex,
            cancelButtonIndex: options.cancelButtonIndex,
            // The app is dark whatever the phone is set to, the same way the
            // tab bar's glass is.
            userInterfaceStyle: "dark",
          },
          resolve,
        );
      });
    }

    return new Promise((resolve) => {
      /* A second ask while one is up settles the first as cancelled rather
       * than leaving its promise hanging for ever. It should not happen — the
       * sheet is modal — but a promise nobody resolves is a leak that never
       * reports itself. */
      settle.current?.(options.cancelButtonIndex ?? -1);
      settle.current = resolve;
      setRequest(options);
    });
  }, []);

  return (
    <ActionSheetContext.Provider value={present}>
      {children}
      {request ? <AndroidSheet request={request} onPick={finish} /> : null}
    </ActionSheetContext.Provider>
  );
}

function AndroidSheet({
  request,
  onPick,
}: {
  request: ActionSheetOptions;
  onPick: (index: number) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cancel = request.cancelButtonIndex ?? -1;
  const destructive = new Set(
    request.destructiveButtonIndex === undefined
      ? []
      : [request.destructiveButtonIndex].flat(),
  );

  /* The cancel row is drawn on its own below the rest, the way the platform
   * sheets on both systems do it, rather than as the last row of the list. */
  const choices = request.options
    .map((label, index) => ({ label, index }))
    .filter(({ index }) => index !== cancel);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      /* Android's back button and back gesture. Without this, back dismisses
         the sheet's window and leaves the promise unsettled — which is the
         same silence this whole file is fixing. */
      onRequestClose={() => onPick(cancel)}
      statusBarTranslucent
    >
      <Pressable
        onPress={() => onPick(cancel)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.6)",
          padding: theme.space(3),
          paddingBottom: Math.max(insets.bottom, theme.space(3)),
        }}
      >
        {/* Swallows the press, so tapping the sheet is not tapping the scrim
            behind it. */}
        <Pressable onPress={() => {}} style={{ gap: theme.space(2) }}>
          <View
            style={{
              backgroundColor: theme.color.surface,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.color.border,
              overflow: "hidden",
            }}
          >
            {request.title || request.message ? (
              <View
                style={{
                  paddingHorizontal: theme.space(4),
                  paddingVertical: theme.space(3),
                  gap: theme.space(1),
                  borderBottomWidth: 1,
                  borderBottomColor: theme.color.border,
                }}
              >
                {request.title ? (
                  <Text
                    style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}
                  >
                    {request.title}
                  </Text>
                ) : null}
                {request.message ? (
                  <Text
                    style={{ color: theme.color.muted, fontSize: 13.5, lineHeight: 19 }}
                  >
                    {request.message}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Scrollable because a message plus five options plus a keyboard
                that has just closed does not always fit a short screen. */}
            <ScrollView bounces={false}>
              {choices.map(({ label, index }, position) => (
                <Pressable
                  key={index}
                  onPress={() => onPick(index)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    paddingHorizontal: theme.space(4),
                    paddingVertical: theme.space(4),
                    borderTopWidth: position === 0 ? 0 : 1,
                    borderTopColor: theme.color.border,
                    backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
                  })}
                >
                  <Text
                    style={{
                      color: destructive.has(index) ? theme.color.danger : theme.color.text,
                      fontSize: 16,
                      fontWeight: destructive.has(index) ? "600" : "500",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {cancel >= 0 ? (
            <Pressable
              onPress={() => onPick(cancel)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                paddingVertical: theme.space(4),
                alignItems: "center",
              })}
            >
              <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
                {request.options[cancel]}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * The two-option confirmations, which are most of what this is used for.
 *
 * Returns whether the person said yes. `confirm` is the affirmative label and
 * is treated as destructive, because every use of it in this app is.
 */
export function useConfirm() {
  const present = useActionSheet();

  return useMemo(
    () =>
      async ({
        title,
        message,
        confirm,
        cancel = "Cancel",
      }: {
        title: string;
        message?: string;
        confirm: string;
        cancel?: string;
      }) => {
        const index = await present({
          title,
          message,
          options: [confirm, cancel],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        });
        return index === 0;
      },
    [present],
  );
}
