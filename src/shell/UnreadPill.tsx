import { Text, useTheme } from "@gryt/ui-native";
import { View } from "react-native";

/**
 * How many messages arrived somewhere while you were somewhere else, and
 * whether any of them named you.
 *
 * A component with this name existed and was deleted in GRYT-488, unused,
 * because nothing could ever have given it a number: the app held one socket,
 * to the server you were looking at. GRYT-496 is what makes the count possible.
 *
 * Capped rather than truncated to a dot. "9+" says there is more than a
 * glance's worth without pretending to a precision nobody reads past.
 *
 * `onAccent` is the theme's own answer to what reads on the accent, so a custom
 * accent cannot make the number disappear.
 */
export function UnreadPill({
  count,
  /**
   * How many of them named you. Shown instead of the message count, with an
   * `@`, because the two are different questions and being asked something
   * is the one worth answering first. Zero draws the plain count.
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
