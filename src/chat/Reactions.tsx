import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";

import type { ReactionSummary } from "./messageAbilities";

function chipFill(mine: boolean, theme: ReturnType<typeof useTheme>): string {
  return mine ? theme.alpha.accent[2] : theme.color.surfaceRaised;
}

/**
 * The reactions on a message — the last step of a path that was already complete. The
 * count comes back on the broadcast, so a chip cannot disagree with the server.
 */
export function Reactions({
  reactions,
  onToggle,
  onShowPeople,
}: {
  reactions: ReactionSummary[];
  /** Absent where the channel denies reacting: the counts show and a tap does nothing. */
  onToggle?: (src: string) => void;
  /** A hold on a chip: who reacted with it. */
  onShowPeople?: (src: string) => void;
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
          onPress={onToggle ? () => onToggle(reaction.src) : undefined}
          onLongPress={onShowPeople ? () => onShowPeople(reaction.src) : undefined}
          disabled={!onToggle && !onShowPeople}
          accessibilityRole={onToggle || onShowPeople ? "button" : "text"}
          accessibilityLabel={`${reaction.src}, ${reaction.count}${reaction.mine ? ", including you" : ""}`}
          accessibilityHint={onShowPeople ? "Hold to see who reacted" : undefined}
          accessibilityState={{ selected: reaction.mine }}
          hitSlop={4}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space(1.5),
            height: 30,
            paddingHorizontal: theme.space(2.5),
            borderRadius: 999,
            /* Your own are outlined in the accent rather than filled: a filled chip at
               this size reads as a button you have not pressed. */
            borderWidth: 1,
            borderColor: reaction.mine ? theme.color.accent : theme.color.border,
            backgroundColor: pressed && onToggle ? theme.color.surfaceHover : chipFill(!!reaction.mine, theme),
          })}
        >
          <Text style={{ fontSize: 15 }}>{reaction.src}</Text>
          <Text
            style={{
              fontSize: 13,
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
  /** Jump to the parent, loaded or not. Absent where there is nowhere to jump. */
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
