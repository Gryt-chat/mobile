import { Children, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Divider, Surface, Text, useTheme } from "@gryt/ui-native";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";

/** A card of rows, with a title over it when it needs one. */
export function MenuGroup({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  // `Children.toArray` drops the nulls, so an absent row leaves no separator behind.
  const rows = Children.toArray(children);

  return (
    <View style={{ gap: theme.space(2) }}>
      {title ? (
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 13,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            paddingHorizontal: theme.space(1),
          }}
        >
          {title}
        </Text>
      ) : null}
      <Surface bordered radius="lg" style={{ overflow: "hidden" }}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <Divider style={{ marginLeft: theme.space(4) + 22 + theme.space(3) }} /> : null}
            {row}
          </View>
        ))}
      </Surface>
    </View>
  );
}

/** One row. A chevron only where there's somewhere to go, and `trailing` replaces it. */
export function MenuRow({
  icon,
  label,
  hint,
  tone,
  onPress,
  trailing,
  chevron = true,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  tone?: "danger";
  onPress?: () => void;
  trailing?: ReactNode;
  chevron?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        minHeight: 52,
        paddingVertical: theme.space(3),
        paddingHorizontal: theme.space(4),
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: tone === "danger" ? theme.color.danger : theme.color.text, fontSize: 17, fontWeight: "500" }}>
          {label}
        </Text>
        {hint ? <Text style={{ color: theme.color.muted, fontSize: 13 }}>{hint}</Text> : null}
      </View>
      {trailing ?? (onPress && chevron && tone !== "danger" ? (
        <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
      ) : null)}
    </Pressable>
  );
}
