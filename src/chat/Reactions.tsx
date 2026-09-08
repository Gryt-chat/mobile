import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";

import type { ReactionSummary } from "./messageAbilities";

/**
 * The reactions on a message — the last step of a path that was already complete. The
 * count comes back on the broadcast, so a chip cannot disagree with the server.
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
            /* Your own are outlined in the accent rather than filled: a filled chip at
               this size reads as a button you have not pressed. */
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
 * What a message is answering. `reply_to_message_id` has been on every message and drawn
 * nowhere. One line, always — a stub that wrapped would push the message down.
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
