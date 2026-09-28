import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";

/**
 * One option in a list of them, shared by every screen that picks a named answer.
 * Copying it per screen would have made the second copy the one that goes stale.
 */
export function ChoiceRow({
  label,
  hint,
  chosen,
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  chosen: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen, disabled }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: theme.color.text, fontSize: 16, fontWeight: chosen ? "600" : "500" }}
        >
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text>
        ) : null}
      </View>
      {chosen ? (
        <CheckCircleIcon size={22} color={theme.color.accent} weight="fill" />
      ) : (
        /* An empty box the size of the check, so every row is the same width of
           content and the text does not shift when the choice moves. */
        <View style={{ width: 22 }} />
      )}
    </Pressable>
  );
}
