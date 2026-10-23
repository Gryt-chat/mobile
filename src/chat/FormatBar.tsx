import { Pressable, ScrollView, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { CodeIcon } from "phosphor-react-native/src/icons/Code";
import { LinkSimpleIcon } from "phosphor-react-native/src/icons/LinkSimple";
import { ListBulletsIcon } from "phosphor-react-native/src/icons/ListBullets";
import { QuotesIcon } from "phosphor-react-native/src/icons/Quotes";
import { TextBIcon } from "phosphor-react-native/src/icons/TextB";
import { TextHOneIcon } from "phosphor-react-native/src/icons/TextHOne";
import { TextHThreeIcon } from "phosphor-react-native/src/icons/TextHThree";
import { TextHTwoIcon } from "phosphor-react-native/src/icons/TextHTwo";
import { TextItalicIcon } from "phosphor-react-native/src/icons/TextItalic";
import { TextStrikethroughIcon } from "phosphor-react-native/src/icons/TextStrikethrough";

import { applyFormat, isActive, type Format } from "./formatText";

const GROUPS: { format: Format; label: string; Icon: typeof CodeIcon }[][] = [
  [
    { format: "bold", label: "Bold", Icon: TextBIcon },
    { format: "italic", label: "Italic", Icon: TextItalicIcon },
    { format: "strike", label: "Strikethrough", Icon: TextStrikethroughIcon },
  ],
  [
    { format: "code", label: "Code", Icon: CodeIcon },
    { format: "link", label: "Link", Icon: LinkSimpleIcon },
  ],
  [
    { format: "h1", label: "Heading 1", Icon: TextHOneIcon },
    { format: "h2", label: "Heading 2", Icon: TextHTwoIcon },
    { format: "h3", label: "Heading 3", Icon: TextHThreeIcon },
  ],
  [
    { format: "list", label: "List", Icon: ListBulletsIcon },
    { format: "quote", label: "Quote", Icon: QuotesIcon },
  ],
];

/** The desktop's format buttons, over the field while text is selected. */
export function FormatBar({
  text,
  start,
  end,
  onApply,
}: {
  text: string;
  start: number;
  end: number;
  onApply: (edit: { text: string; start: number; end: number }) => void;
}) {
  const theme = useTheme();
  if (end <= start) return null;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.color.border }}>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center", gap: theme.space(3), paddingHorizontal: theme.space(2), paddingVertical: theme.space(1.5) }}
      >
        {GROUPS.map((group) => (
          <View key={group[0].format} style={{ flexDirection: "row", gap: theme.space(0.5) }}>
            {group.map(({ format, label, Icon }) => {
              const on = isActive(text, start, end, format);
              return (
                <Pressable
                  key={format}
                  onPress={() => onApply(applyFormat(text, start, end, format))}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({
                    width: 34,
                    height: 34,
                    borderRadius: theme.radius.full,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on || pressed ? theme.color.surfaceHover : "transparent",
                  })}
                >
                  <Icon size={18} color={on ? theme.color.accent : theme.color.text} weight="bold" />
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
