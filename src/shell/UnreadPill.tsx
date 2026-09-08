import { Text, useTheme } from "@gryt/ui-native";
import { View } from "react-native";

/**
 * How many messages arrived somewhere while you were somewhere else, and whether any of
 * them named you. Capped rather than truncated to a dot. `onAccent` is the theme's own
 * answer, so a custom accent cannot make the number disappear.
 */
export function UnreadPill({
  count,
  /**
   * How many of them named you. Shown instead of the message count, with an `@`: being
   * asked something is the question worth answering first. Zero draws the plain count.
   */
  mentions = 0,
}: {
  count: number;
  mentions?: number;
}) {
  const theme = useTheme();

  if (count <= 0 && mentions <= 0) return null;

  const shown = mentions > 0 ? mentions : count;
  const capped = shown > 9 ? "9+" : String(shown);

  return (
    <View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.color.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityLabel={
        mentions > 0
          ? `${mentions === 1 ? "1 mention" : `${mentions} mentions`}`
          : `${count} unread`
      }
    >
      <Text style={{ color: theme.color.onAccent, fontSize: 12, fontWeight: "700" }}>
        {mentions > 0 ? `@${capped}` : capped}
      </Text>
    </View>
  );
}
