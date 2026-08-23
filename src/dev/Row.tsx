import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

/** A labelled group inside a component's page. */
export function Case({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={styles.case}>
      {title ? (
        <Text style={[styles.caseTitle, { color: theme.color.muted }]}>{title}</Text>
      ) : null}
      <View style={styles.caseBody}>{children}</View>
    </View>
  );
}

/** Lays children out horizontally, wrapping. */
export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** Plain text in the theme's body colour, for labelling controls. */
export function Label({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={{ color: theme.color.text }}>{children}</Text>;
}

/** Muted note under a demo — used for the things a screenshot cannot say. */
export function Note({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.note, { color: theme.color.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  case: { gap: 8 },
  caseTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8 },
  caseBody: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  note: { fontSize: 12, lineHeight: 17 },
  trigger: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: "flex-start"
  }
});

/**
 * A button-shaped label for use inside a `Trigger`.
 *
 * Every overlay's `Trigger` is itself a `Pressable`. Putting a `Button` inside
 * one nests two pressables, the inner one wins the touch, and the overlay never
 * opens — silently, with no warning. The web library has `render`/`asChild` for
 * this; the native one does not, so a trigger's child has to be plain visual
 * content.
 *
 * This looks like a Button and is deliberately not one.
 */
export function TriggerLabel({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "danger";
}) {
  const theme = useTheme();
  const background =
    tone === "primary"
      ? theme.color.accent
      : tone === "danger"
        ? theme.color.danger
        : theme.scales.neutral[3];
  const color =
    tone === "primary"
      ? theme.color.onAccent
      : tone === "danger"
        ? theme.color.onDanger
        : theme.color.text;

  return (
    <View style={[styles.trigger, { backgroundColor: background }]}>
      <Text style={{ color, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}
