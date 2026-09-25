import { useCallback, useState } from "react";
import { Pressable, View, type LayoutChangeEvent, type TextStyle } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretUpIcon } from "phosphor-react-native/src/icons/CaretUp";

/** How much of a folded message stays visible. */
const COLLAPSED_MAX_LINES = 20;

/** How much has to be behind the fold for the fold to pay for itself. */
const WORTH_FOLDING_LINES = 20;

/** Falls back to this when the row didn't set an explicit lineHeight. */
const ASSUMED_LINE_RATIO = 1.5;

interface Fold {
  maxPx: number;
  hiddenLines: number;
}

/** Folds a tall message past 20 lines, same threshold and labels as the
 * desktop CollapsibleText, measured with a hidden twin (GRYT-1451). */
export function CollapsibleText({
  children,
  style,
}: {
  children: React.ReactNode;
  /** Only lineHeight and fontSize are read, to size the fold in lines rather than pixels. */
  style: Pick<TextStyle, "lineHeight" | "fontSize">;
}) {
  const theme = useTheme();
  const [fold, setFold] = useState<Fold | null>(null);
  const [expanded, setExpanded] = useState(false);

  const lineHeight = style.lineHeight ?? (style.fontSize ?? 16) * ASSUMED_LINE_RATIO;

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const maxPx = Math.round(lineHeight * COLLAPSED_MAX_LINES);
      const hiddenPx = e.nativeEvent.layout.height - maxPx;

      if (hiddenPx < lineHeight * WORTH_FOLDING_LINES) {
        setFold((current) => (current === null ? current : null));
        return;
      }

      // Floored at 1 rather than claiming 0.
      const hiddenLines = Math.max(1, Math.floor(hiddenPx / lineHeight));
      setFold((current) =>
        current !== null && current.maxPx === maxPx && current.hiddenLines === hiddenLines
          ? current
          : { maxPx, hiddenLines },
      );
    },
    [lineHeight],
  );

  const folds = fold !== null;
  const clipped = folds && !expanded;
  const label = folds && !expanded
    ? `Show ${fold.hiddenLines} more ${fold.hiddenLines === 1 ? "line" : "lines"}`
    : "Show less";

  return (
    <View>
      {/* Off-screen and always at natural height, because a maxHeight on the
          visible copy's ancestor would otherwise constrain what onLayout
          reports too — Yoga isn't the DOM, and scrollHeight has no equivalent. */}
      <View
        collapsable={false}
        pointerEvents="none"
        onLayout={onLayout}
        style={{ position: "absolute", left: 0, right: 0, top: 0, opacity: 0 }}
      >
        {children}
      </View>

      <View style={clipped ? { maxHeight: fold.maxPx, overflow: "hidden" } : undefined}>
        {children}

        {/* Only when folded, and inside the clipped box so it fades the last
            visible lines rather than sitting below content that isn't there. */}
        {clipped ? <Fade color={theme.color.bg} /> : null}
      </View>

      {folds ? (
        <Pressable
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            alignSelf: "flex-start",
            marginTop: theme.space(1),
            paddingVertical: 3,
            paddingHorizontal: 9,
            borderRadius: theme.radius.sm,
            // Neutral at rest, not accent — this is chrome, not a link in
            // the message.
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <Text style={{ color: theme.color.muted, fontSize: 12, fontWeight: "500" }}>
            {expanded ? (
              "Show less"
            ) : (
              <>
                Show <Text style={{ color: theme.color.text }}>{fold.hiddenLines}</Text> more{" "}
                {fold.hiddenLines === 1 ? "line" : "lines"}
              </>
            )}
          </Text>
          {expanded ? (
            <CaretUpIcon size={12} color={theme.color.muted} />
          ) : (
            <CaretDownIcon size={12} color={theme.color.muted} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** A poor man's gradient: stacked flat layers rather than a dependency
 * nothing else in this app needs yet. */
function Fade({ color }: { color: string }) {
  const steps = [0.06, 0.22, 0.5, 0.85];
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 44 }}
    >
      {steps.map((opacity, i) => (
        <View
          key={i}
          style={{ flex: 1, backgroundColor: color, opacity }}
        />
      ))}
    </View>
  );
}
