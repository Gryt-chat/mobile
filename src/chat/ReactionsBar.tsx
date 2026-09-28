import { Pressable, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { Reactions } from "./Reactions";
import type { ReactionSummary } from "./messageAbilities";

/**
 * `Reactions` plus a way to add one that isn't there yet. A sibling rather than a change
 * to `Reactions.tsx`, whose toggle logic already works and stays untouched.
 */
export function ReactionsBar({
  reactions,
  onToggle,
  onAdd,
}: {
  reactions: ReactionSummary[];
  onToggle?: (src: string) => void;
  /** Opens the full picker. Absent where the channel denies it. */
  onAdd?: () => void;
}) {
  const theme = useTheme();

  if (reactions.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Reactions reactions={reactions} onToggle={onToggle} />
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a reaction"
          hitSlop={4}
          style={({ pressed }) => ({
            width: 28,
            height: 24,
            marginTop: theme.space(1.5),
            marginLeft: theme.space(1.5),
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: theme.color.border,
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <PlusIcon size={14} color={theme.color.muted} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}
