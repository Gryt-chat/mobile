import { Pressable, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";

import { Text } from "../ui/Text";
import type { ReactionSummary } from "./messageAbilities";

/**
 * The reactions on a message.
 *
 * They have been arriving since reactions existed: the app subscribes to
 * `chat:reaction`, folds the updated message into state, and then the row never
 * read the field. Nothing here is new data — it is the last step of a path that
 * was already complete.
 *
 * Tapping one toggles it. The server decides which way, and the count comes
 * back on the broadcast rather than being guessed here, so a chip cannot
 * disagree with the server about its own number.
 */
export function Reactions({
  reactions,
  onToggle,
}: {
  reactions: ReactionSummary[];
  onToggle: (src: string) => void;
}) {
  const theme = useTheme();

  if (reactions.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: theme.space(1.5),
        marginTop: theme.space(1.5),
      }}
    >
      {reactions.map((reaction) => (
        <Pressable
          key={reaction.src}
          onPress={() => onToggle(reaction.src)}
          accessibilityRole="button"
          accessibilityLabel={`${reaction.src}, ${reaction.count}${reaction.mine ? ", including you" : ""}`}
          accessibilityState={{ selected: reaction.mine }}
          hitSlop={4}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space(1.5),
            paddingHorizontal: theme.space(2),
            paddingVertical: 2,
            borderRadius: 999,
            /* Your own reactions are outlined in the accent rather than filled
               with it: a filled chip at this size reads as a button you have
               not pressed yet. */
            borderWidth: 1,
            borderColor: reaction.mine ? theme.color.accent : theme.color.border,
            backgroundColor: pressed
              ? theme.color.surfaceHover
              : reaction.mine
                ? theme.alpha.accent[2]
                : theme.color.surfaceRaised,
          })}
        >
          <Text style={{ fontSize: 13 }}>{reaction.src}</Text>
          <Text
            style={{
              fontSize: 12,
              color: reaction.mine ? theme.color.accent : theme.color.muted,
              fontWeight: "600",
            }}
          >
            {reaction.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * What a message is answering.
 *
 * `reply_to_message_id` has been on every message all along and drawn nowhere,
 * so a reply read as a non-sequitur unless you remembered what came before.
 *
 * One line, always: `quoteOf` collapses the parent's newlines before it gets
 * here, and the row truncates whatever is left. A stub that wrapped would push
 * the message it belongs to down the screen.
 */
export function ReplyStub({
  author,
  quote,
  onPress,
}: {
  author: string;
  quote: string;
  /** Jump to the parent, when it is loaded. Absent when it is not. */
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Replying to ${author}: ${quote}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(1.5),
        marginBottom: 2,
        opacity: pressed && onPress ? 0.6 : 1,
      })}
    >
      <ArrowBendUpLeftIcon size={12} color={theme.color.muted} weight="bold" />
      <Text
        style={{ color: theme.color.text, fontSize: 12.5, fontWeight: "600" }}
        numberOfLines={1}
      >
        {author}
      </Text>
      <Text
        numberOfLines={1}
        style={{ color: theme.color.muted, fontSize: 12.5, flex: 1, minWidth: 0 }}
      >
        {quote}
      </Text>
    </Pressable>
  );
}
