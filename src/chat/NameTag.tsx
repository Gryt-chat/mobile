import { Text, useTheme } from "@gryt/ui-native";

/** The tag after a name somebody else here also uses (GRYT-1674). Nested in the
    name's own `Text`, so it wraps with it; muted, so the name still reads first. */
export function NameTag({ tag }: { tag: string }) {
  const theme = useTheme();
  return (
    <Text mono style={{ color: theme.color.muted, fontSize: 12, fontWeight: "500", textTransform: "none", letterSpacing: 0 }}>
      {` · ${tag}`}
    </Text>
  );
}
