import { View, type ViewStyle } from "react-native";
import { useTheme } from "@gryt/ui-native";

import type { MessageLayout, OwnMessageSide } from "./appearance";

/* Drawn shapes, not real messages: they only need to show the layout, as on the desktop. */
const OTHERS = ["#e58aa8", "#8cc0ea"];
const MINE = "#e8a96b";

const ROWS = [
  { color: OTHERS[0], width: 44, mine: false },
  { color: MINE, width: 32, mine: true },
  { color: OTHERS[1], width: 52, mine: false },
];

function bar(width: number, color: string, height = 4): ViewStyle {
  return { width, height, borderRadius: height / 2, backgroundColor: color };
}

function dot(color: string, size = 10): ViewStyle {
  return { width: size, height: size, borderRadius: size / 2, backgroundColor: color };
}

/** A small picture of a message style, beside its name in Preferences. */
export function MessageStylePreview({ layout, side }: { layout: MessageLayout; side: OwnMessageSide }) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 96,
        gap: layout === "compact" ? 7 : 8,
        padding: 8,
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.surfaceRaised,
      }}
    >
      {ROWS.map((r, i) => {
        const right = r.mine && side === "right";
        if (layout === "compact") {
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3, justifyContent: right ? "flex-end" : "flex-start" }}>
              <View style={bar(6, theme.color.border, 3)} />
              <View style={bar(10, r.color)} />
              <View style={bar(r.width - 10, theme.color.muted)} />
            </View>
          );
        }
        if (layout === "bubbles") {
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4, justifyContent: right ? "flex-end" : "flex-start" }}>
              {right ? null : <View style={dot(r.color)} />}
              <View style={{ ...bar(r.width, r.mine ? theme.color.accent : theme.color.border, 10), borderRadius: 5 }} />
            </View>
          );
        }
        return (
          <View key={i} style={{ flexDirection: right ? "row-reverse" : "row", gap: 4 }}>
            <View style={dot(r.color)} />
            <View style={{ gap: 3, alignItems: right ? "flex-end" : "flex-start" }}>
              <View style={bar(14, theme.color.border)} />
              <View style={bar(r.width, theme.color.muted)} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
