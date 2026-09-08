import { useMemo } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

import { useCustomEmojis } from "./CustomEmojiProvider";
import { rank, type Query } from "./autocomplete";
import { standardEmojiNames, unicodeFor } from "./emoji";

/**
 * What is on offer while a `@` or a `:` is being typed — one strip for both, because a
 * phone has no arrow keys and one row above the keyboard. **Horizontal rather than a
 * list**, which would cover the message being replied to.
 */
export function Suggestions({
  query,
  people,
  onPick,
}: {
  /** What the caret is inside, or null to draw nothing. */
  query: Query | null;
  /** Nicknames on this server. */
  people: string[];
  onPick: (choice: string) => void;
}) {
  const theme = useTheme();
  const custom = useCustomEmojis();

  const choices = useMemo(() => {
    if (!query) return [];
    if (query.trigger === "@") return rank(people, query.term);

    /* This server's own emoji first: a server uploads them because it wants them used,
     * and they are the ones nobody can guess the name of. Only searched once there is
     * a term — an empty one would rank several thousand entries. */
    if (!query.term) return rank([...custom.keys()], "");
    return rank([...custom.keys(), ...standardEmojiNames()], query.term);
  }, [query, people, custom]);

  if (!query || choices.length === 0) return null;

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border,
      }}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: theme.space(2),
          paddingHorizontal: theme.space(3),
          paddingVertical: theme.space(2),
        }}
      >
        {choices.map((choice) => (
          <Pressable
            key={choice}
            onPress={() => onPick(choice)}
            accessibilityRole="button"
            accessibilityLabel={query.trigger === "@" ? `Mention ${choice}` : `Insert ${choice}`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(1.5),
              paddingHorizontal: theme.space(3),
              paddingVertical: theme.space(1.5),
              borderRadius: theme.radius.full,
              backgroundColor: pressed ? theme.color.surfaceHover : theme.color.bg,
              borderWidth: 1,
              borderColor: theme.color.border,
            })}
          >
            {query.trigger === ":" ? <Preview name={choice} url={custom.get(choice)} /> : null}
            <Text style={{ color: theme.color.text, fontSize: 14 }}>
              {query.trigger === "@" ? choice : `:${choice}:`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Preview({ name, url }: { name: string; url: string | undefined }) {
  if (url) {
    return (
      <Image source={{ uri: url }} style={{ width: 18, height: 18 }} resizeMode="contain" />
    );
  }
  const character = unicodeFor(name);
  return character ? <Text style={{ fontSize: 16 }}>{character}</Text> : null;
}
